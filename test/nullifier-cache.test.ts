import crypto from 'crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { ChainDB } from '@railgun-reloaded/storage'
import {
  createChainDB,
  deleteNullifiersFromBlock,
  insertNullifiersBatch,
} from '@railgun-reloaded/storage'

import { NullifierCache } from '../src/nullifier-cache'

/**
 * Generate random bytes for test data.
 * @param size - Number of random bytes to produce.
 * @returns Random Uint8Array of the requested size.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/**
 * Create an in-memory chain database for testing.
 * @returns A fresh ChainDB backed by a `:memory:` SQLite instance.
 */
async function createTestDb (): Promise<ChainDB> {
  return createChainDB({
    path: ':memory:',
    runMigrations: true
  })
}

/**
 * Insert test nullifiers into the database and return their hex values.
 * @param db - Chain database instance.
 * @param count - Number of nullifiers to insert.
 * @param startBlock - Starting block number for the nullifiers.
 * @returns Array of hex-encoded nullifier strings.
 */
async function insertTestNullifiers (db: ChainDB, count: number, startBlock: bigint): Promise<string[]> {
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
  await insertNullifiersBatch(db, batch)
  return hexValues
}

test('NullifierCache: initialize loads all nullifiers', async () => {
  const db = await createTestDb()
  const hexValues = await insertTestNullifiers(db, 5, 100n)
  const cache = new NullifierCache()

  await cache.initialize(db)

  assert.equal(cache.size, 5)
  for (const hex of hexValues) {
    assert.ok(cache.nullifiers.has(hex))
  }
  assert.equal(cache.lastBlock, 104n)
})

test('NullifierCache: initialize on empty db', async () => {
  const db = await createTestDb()
  const cache = new NullifierCache()

  await cache.initialize(db)

  assert.equal(cache.size, 0)
  assert.equal(cache.lastBlock, -1n)
})

test('NullifierCache: update adds only new nullifiers', async () => {
  const db = await createTestDb()
  const initial = await insertTestNullifiers(db, 3, 100n)
  const cache = new NullifierCache()
  await cache.initialize(db)
  assert.equal(cache.size, 3)

  const added = await insertTestNullifiers(db, 4, 200n)
  const count = await cache.update(db)

  assert.equal(count, 4)
  assert.equal(cache.size, 7)
  assert.equal(cache.lastBlock, 203n)
  for (const hex of [...initial, ...added]) {
    assert.ok(cache.nullifiers.has(hex))
  }
})

test('NullifierCache: update with no new nullifiers', async () => {
  const db = await createTestDb()
  await insertTestNullifiers(db, 3, 100n)
  const cache = new NullifierCache()
  await cache.initialize(db)

  const count = await cache.update(db)
  assert.equal(count, 0)
  assert.equal(cache.size, 3)
})

test('NullifierCache: handleReorg clears and reloads', async () => {
  const db = await createTestDb()
  await insertTestNullifiers(db, 5, 100n)
  const cache = new NullifierCache()
  await cache.initialize(db)
  assert.equal(cache.size, 5)

  await deleteNullifiersFromBlock(db, 103n)
  await cache.handleReorg(db)

  assert.equal(cache.size, 3)
  assert.equal(cache.lastBlock, 102n)
})
