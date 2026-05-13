import crypto from 'crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { Transact } from '@railgun-reloaded/scanner'
import type { ChainDB } from '@railgun-reloaded/storage'
import {
  createChainDB,
  getNullifiersByBlockRange,
} from '@railgun-reloaded/storage'

import { aggregateBalances } from '../src/balance'
import { NullifierCache } from '../src/nullifier-cache'
import { loadNullifierSet, syncNullifiers } from '../src/nullifier-store'
import type { DecryptedNote } from '../src/types'

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

test('syncNullifiers persists nullifiers from Transact events', () => {
  const db = createTestDb()
  const event1 = createMockTransact(3, 0)
  const event2 = createMockTransact(2, 1)
  const txHash = randomBytes(32)

  syncNullifiers(db, [event1, event2], 100n, txHash)

  const stored = getNullifiersByBlockRange(db, 100n, 100n)
  assert.equal(stored.length, 5)
})

test('syncNullifiers updates cache when provided', () => {
  const db = createTestDb()
  const event = createMockTransact(3, 0)
  const txHash = randomBytes(32)
  const cache = new NullifierCache()
  cache.initialize(db)

  syncNullifiers(db, [event], 100n, txHash, cache)

  assert.equal(cache.size, 3)
  assert.equal(cache.lastBlock, 100n)
  for (const n of event.nullifiers) {
    assert.ok(cache.nullifiers.has(bytesToHex(n, { prefix: true })))
  }
})

test('syncNullifiers with empty events does nothing', () => {
  const db = createTestDb()
  const txHash = randomBytes(32)

  syncNullifiers(db, [], 100n, txHash)

  const stored = getNullifiersByBlockRange(db, 0n, 200n)
  assert.equal(stored.length, 0)
})

test('loadNullifierSet without cache does full load', () => {
  const db = createTestDb()
  const event = createMockTransact(4, 0)
  const txHash = randomBytes(32)
  syncNullifiers(db, [event], 100n, txHash)

  const set = loadNullifierSet(db)

  assert.equal(set.size, 4)
  for (const n of event.nullifiers) {
    assert.ok(set.has(bytesToHex(n, { prefix: true })))
  }
})

test('loadNullifierSet with uninitialized cache initializes it', () => {
  const db = createTestDb()
  const event = createMockTransact(3, 0)
  syncNullifiers(db, [event], 100n, randomBytes(32))
  const cache = new NullifierCache()

  const set = loadNullifierSet(db, cache)

  assert.equal(set.size, 3)
  assert.ok(cache.isInitialized)
})

test('loadNullifierSet with initialized cache does incremental update', () => {
  const db = createTestDb()
  syncNullifiers(db, [createMockTransact(3, 0)], 100n, randomBytes(32))
  const cache = new NullifierCache()
  cache.initialize(db)
  assert.equal(cache.size, 3)

  syncNullifiers(db, [createMockTransact(2, 0)], 200n, randomBytes(32))
  const set = loadNullifierSet(db, cache)

  assert.equal(set.size, 5)
  assert.equal(cache.lastBlock, 200n)
})

/**
 * Build a DecryptedNote stub for balance aggregation tests.
 * @param nullifier - Raw nullifier bytes.
 * @param token - Token address used for grouping.
 * @param amount - Note amount.
 * @returns Fully-populated DecryptedNote.
 */
function makeNote (nullifier: Uint8Array, token: string, amount: bigint): DecryptedNote {
  return {
    commitment: bytesToHex(randomBytes(32), { prefix: true }),
    walletId: 'test-wallet',
    nullifier: bytesToHex(nullifier, { prefix: true }),
    token,
    amount,
    tokenType: 0,
    tokenSubID: `0x${'00'.repeat(32)}`,
    blockNumber: 100n,
    treeId: 0,
    leafIndex: 0n,
    commitmentType: 'TransactCommitment',
    outputType: null,
  }
}

test('integration: aggregateBalances excludes spent notes from loaded nullifier set', () => {
  const db = createTestDb()

  const spentNullifierA = randomBytes(32)
  const spentNullifierB = randomBytes(32)
  const unspentNullifier = randomBytes(32)

  const event = {
    actionType: 'TransactCommitment',
    txID: randomBytes(32),
    nullifiers: [spentNullifierA, spentNullifierB],
    commitments: [],
    boundParamsHash: randomBytes(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    hasUnshield: false,
  } as unknown as Transact

  syncNullifiers(db, [event], 100n, randomBytes(32))
  const nullifierSet = loadNullifierSet(db)

  const notes: DecryptedNote[] = [
    makeNote(spentNullifierA, '0xTokenA', 100n),
    makeNote(spentNullifierB, '0xTokenA', 200n),
    makeNote(unspentNullifier, '0xTokenA', 300n),
    makeNote(randomBytes(32), '0xTokenB', 500n),
  ]

  const balances = aggregateBalances(notes, nullifierSet)

  assert.equal(balances.length, 2)

  const tokenA = balances.find(b => b.token === '0xTokenA')
  assert.ok(tokenA, 'TokenA balance present')
  assert.equal(tokenA!.balance, 300n)
  assert.equal(tokenA!.utxos.length, 1)
  assert.equal(tokenA!.utxos[0]!.nullifier, bytesToHex(unspentNullifier, { prefix: true }))

  const tokenB = balances.find(b => b.token === '0xTokenB')
  assert.ok(tokenB, 'TokenB balance present')
  assert.equal(tokenB!.balance, 500n)
})
