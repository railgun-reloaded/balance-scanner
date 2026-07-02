import crypto from 'crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { ChainStorage } from '@railgun-reloaded/storage'
import { createChainDB, createChainStorage } from '@railgun-reloaded/storage/node'

import { NullifierCache } from '../src/nullifier-cache.js'

/**
 * Generate random bytes for test data.
 * @param size - Number of random bytes to produce.
 * @returns Random Uint8Array of the requested size.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/**
 * Create a chain storage backed by an in-memory database for testing.
 * @returns A fresh ChainStorage backed by a `:memory:` SQLite instance.
 */
async function createTestStorage (): Promise<ChainStorage> {
  const db = await createChainDB({
    path: ':memory:',
    runMigrations: true
  })
  return createChainStorage(db)
}

/**
 * Insert test nullifiers into storage and return their hex values.
 * @param storage - Chain storage instance.
 * @param count - Number of nullifiers to insert.
 * @param startBlock - Starting block number for the nullifiers.
 * @returns Array of hex-encoded nullifier strings.
 */
async function insertTestNullifiers (storage: ChainStorage, count: number, startBlock: bigint): Promise<string[]> {
  const batch = []
  const hexValues: string[] = []
  for (let i = 0; i < count; i++) {
    const nullifier = randomBytes(32)
    hexValues.push(bytesToHex(nullifier, { prefix: true }))
    batch.push({
      nullifier,
      transactionHash: randomBytes(32),
      blockNumber: startBlock + BigInt(i),
      treeNumber: 0
    })
  }
  await storage.insertNullifiersBatch(batch)
  return hexValues
}

test('NullifierCache: initialize loads all nullifiers', async () => {
  const storage = await createTestStorage()
  const hexValues = await insertTestNullifiers(storage, 5, 100n)
  const cache = new NullifierCache()

  await cache.initialize(storage)

  assert.equal(cache.size, 5)
  for (const hex of hexValues) {
    assert.ok(cache.nullifiers.has(hex))
  }
  assert.equal(cache.lastBlock, 104n)
})

test('NullifierCache: initialize on empty db', async () => {
  const storage = await createTestStorage()
  const cache = new NullifierCache()

  await cache.initialize(storage)

  assert.equal(cache.size, 0)
  assert.equal(cache.lastBlock, -1n)
})

test('NullifierCache: update adds only new nullifiers', async () => {
  const storage = await createTestStorage()
  const initial = await insertTestNullifiers(storage, 3, 100n)
  const cache = new NullifierCache()
  await cache.initialize(storage)
  assert.equal(cache.size, 3)

  const added = await insertTestNullifiers(storage, 4, 200n)
  const count = await cache.update(storage)

  assert.equal(count, 4)
  assert.equal(cache.size, 7)
  assert.equal(cache.lastBlock, 203n)
  for (const hex of [...initial, ...added]) {
    assert.ok(cache.nullifiers.has(hex))
  }
})

test('NullifierCache: update with no new nullifiers', async () => {
  const storage = await createTestStorage()
  await insertTestNullifiers(storage, 3, 100n)
  const cache = new NullifierCache()
  await cache.initialize(storage)

  const count = await cache.update(storage)
  assert.equal(count, 0)
  assert.equal(cache.size, 3)
})

test('NullifierCache: handleReorg clears and reloads', async () => {
  const storage = await createTestStorage()
  await insertTestNullifiers(storage, 5, 100n)
  const cache = new NullifierCache()
  await cache.initialize(storage)
  assert.equal(cache.size, 5)

  await storage.deleteNullifiersFromBlock(103n)
  await cache.handleReorg(storage)

  assert.equal(cache.size, 3)
  assert.equal(cache.lastBlock, 102n)
})
