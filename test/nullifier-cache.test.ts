import crypto from 'crypto'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { ChainDB } from '@railgun-reloaded/storage'
import {
  createChainDB,
  deleteNullifiersFromBlock,
  insertNullifiersBatch,
} from '@railgun-reloaded/storage'
import { test } from 'brittle'

import { NullifierCache } from '../src/nullifier-cache'

/**
 * Generate random bytes for test data.
 * @param size - Number of random bytes to produce.
 * @returns Random Uint8Array of the requested size.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/** Create an in-memory chain database for testing. */
function createTestDb (): ChainDB {
  return createChainDB({
    path: ':memory:',
    enableWAL: false,
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
function insertTestNullifiers (db: ChainDB, count: number, startBlock: bigint): string[] {
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
  insertNullifiersBatch(db, batch)
  return hexValues
}

test('NullifierCache: initialize loads all nullifiers', (t) => {
  const db = createTestDb()
  const hexValues = insertTestNullifiers(db, 5, 100n)
  const cache = new NullifierCache()

  cache.initialize(db)

  t.is(cache.size, 5)
  for (const hex of hexValues) {
    t.ok(cache.nullifiers.has(hex))
  }
  t.is(cache.lastBlock, 104n)
})

test('NullifierCache: initialize on empty db', (t) => {
  const db = createTestDb()
  const cache = new NullifierCache()

  cache.initialize(db)

  t.is(cache.size, 0)
  t.is(cache.lastBlock, -1n)
})

test('NullifierCache: update adds only new nullifiers', (t) => {
  const db = createTestDb()
  const initial = insertTestNullifiers(db, 3, 100n)
  const cache = new NullifierCache()
  cache.initialize(db)
  t.is(cache.size, 3)

  const added = insertTestNullifiers(db, 4, 200n)
  const count = cache.update(db)

  t.is(count, 4)
  t.is(cache.size, 7)
  t.is(cache.lastBlock, 203n)
  for (const hex of [...initial, ...added]) {
    t.ok(cache.nullifiers.has(hex))
  }
})

test('NullifierCache: update with no new nullifiers', (t) => {
  const db = createTestDb()
  insertTestNullifiers(db, 3, 100n)
  const cache = new NullifierCache()
  cache.initialize(db)

  const count = cache.update(db)
  t.is(count, 0)
  t.is(cache.size, 3)
})

test('NullifierCache: handleReorg clears and reloads', (t) => {
  const db = createTestDb()
  insertTestNullifiers(db, 5, 100n)
  const cache = new NullifierCache()
  cache.initialize(db)
  t.is(cache.size, 5)

  deleteNullifiersFromBlock(db, 103n)
  cache.handleReorg(db)

  t.is(cache.size, 3)
  t.is(cache.lastBlock, 102n)
})
