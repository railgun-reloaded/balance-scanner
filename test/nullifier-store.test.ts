import crypto from 'crypto'

import { test } from 'brittle'
import type { Transact } from '@railgun-reloaded/scanner'
import {
  createChainDB,
  getNullifiersByBlockRange,
} from '@railgun-reloaded/storage'
import type { ChainDB } from '@railgun-reloaded/storage'
import { uint8ArrayToHex } from '@railgun-reloaded/wallet-node'

import { NullifierCache } from '../src/nullifier-cache'
import { loadNullifierSet, syncNullifiers } from '../src/nullifier-store'

/**
 * Generate random bytes of given size.
 * @param size - Number of random bytes.
 * @returns Random Uint8Array.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/**
 * Create an in-memory chain database for testing.
 * @returns ChainDB instance.
 */
function createTestDb (): ChainDB {
  return createChainDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: true
  })
}

/**
 * Create a mock Transact event with random nullifiers.
 * @param nullifierCount - Number of nullifiers to include.
 * @param treeIn - Tree number for utxoTreeIn.
 * @returns Mock Transact event.
 */
function createMockTransact (nullifierCount: number, treeIn: number): Transact {
  const nullifiers = Array.from({ length: nullifierCount }, () => randomBytes(32))
  return {
    actionType: 'TransactCommitment',
    txID: randomBytes(32),
    nullifiers,
    commitments: [],
    boundParamsHash: randomBytes(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: treeIn,
    utxoTreeOut: 0,
    hasUnshield: false,
  } as unknown as Transact
}

test('syncNullifiers persists nullifiers from Transact events', (t) => {
  const db = createTestDb()
  const event1 = createMockTransact(3, 0)
  const event2 = createMockTransact(2, 1)
  const txHash = randomBytes(32)

  syncNullifiers(db, [event1, event2], 100n, txHash)

  const stored = getNullifiersByBlockRange(db, 100n, 100n)
  t.is(stored.length, 5)
})

test('syncNullifiers updates cache when provided', (t) => {
  const db = createTestDb()
  const event = createMockTransact(3, 0)
  const txHash = randomBytes(32)
  const cache = new NullifierCache()
  cache.initialize(db)

  syncNullifiers(db, [event], 100n, txHash, cache)

  t.is(cache.size, 3)
  t.is(cache.lastBlock, 100n)
  for (const n of event.nullifiers) {
    t.ok(cache.nullifiers.has(uint8ArrayToHex(n)))
  }
})

test('syncNullifiers with empty events does nothing', (t) => {
  const db = createTestDb()
  const txHash = randomBytes(32)

  syncNullifiers(db, [], 100n, txHash)

  const stored = getNullifiersByBlockRange(db, 0n, 200n)
  t.is(stored.length, 0)
})

test('loadNullifierSet without cache does full load', (t) => {
  const db = createTestDb()
  const event = createMockTransact(4, 0)
  const txHash = randomBytes(32)
  syncNullifiers(db, [event], 100n, txHash)

  const set = loadNullifierSet(db)

  t.is(set.size, 4)
  for (const n of event.nullifiers) {
    t.ok(set.has(uint8ArrayToHex(n)))
  }
})

test('loadNullifierSet with uninitialized cache initializes it', (t) => {
  const db = createTestDb()
  const event = createMockTransact(3, 0)
  syncNullifiers(db, [event], 100n, randomBytes(32))
  const cache = new NullifierCache()

  const set = loadNullifierSet(db, cache)

  t.is(set.size, 3)
  t.ok(cache.isInitialized)
})

test('loadNullifierSet with initialized cache does incremental update', (t) => {
  const db = createTestDb()
  syncNullifiers(db, [createMockTransact(3, 0)], 100n, randomBytes(32))
  const cache = new NullifierCache()
  cache.initialize(db)
  t.is(cache.size, 3)

  syncNullifiers(db, [createMockTransact(2, 0)], 200n, randomBytes(32))
  const set = loadNullifierSet(db, cache)

  t.is(set.size, 5)
  t.is(cache.lastBlock, 200n)
})

test('integration: spent notes excluded from balance set', (t) => {
  const db = createTestDb()

  const nullifier1 = randomBytes(32)
  const nullifier2 = randomBytes(32)
  const nullifier3 = randomBytes(32)

  const event = {
    actionType: 'TransactCommitment',
    txID: randomBytes(32),
    nullifiers: [nullifier1, nullifier2],
    commitments: [],
    boundParamsHash: randomBytes(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    hasUnshield: false,
  } as unknown as Transact

  syncNullifiers(db, [event], 100n, randomBytes(32))
  const nullifierSet = loadNullifierSet(db)

  const notes = [
    { nullifier: uint8ArrayToHex(nullifier1), amount: 100n },
    { nullifier: uint8ArrayToHex(nullifier2), amount: 200n },
    { nullifier: uint8ArrayToHex(nullifier3), amount: 300n },
  ]

  const unspent = notes.filter(n => !nullifierSet.has(n.nullifier))
  t.is(unspent.length, 1)
  t.is(unspent[0]!.amount, 300n)

  const balance = unspent.reduce((sum, n) => sum + n.amount, 0n)
  t.is(balance, 300n)
})
