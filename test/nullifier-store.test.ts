import crypto from 'crypto'

import { test } from 'brittle'
import type { Transact } from '@railgun-reloaded/scanner'
import {
  createChainDB,
  getNullifiersByBlockRange,
} from '@railgun-reloaded/storage'
import type { ChainDB } from '@railgun-reloaded/storage'
import { uint8ArrayToHex } from '@railgun-reloaded/wallet-node'

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

/**
 * Build a DecryptedNote stub for balance aggregation tests.
 * @param nullifier - Raw nullifier bytes.
 * @param token - Token address used for grouping.
 * @param amount - Note amount.
 * @returns Fully-populated DecryptedNote.
 */
function makeNote (nullifier: Uint8Array, token: string, amount: bigint): DecryptedNote {
  return {
    commitment: uint8ArrayToHex(randomBytes(32)),
    walletId: 'test-wallet',
    nullifier: uint8ArrayToHex(nullifier),
    token,
    amount,
    blockNumber: 100n,
    treeId: 0,
    leafIndex: 0n,
    commitmentType: 'TransactCommitment',
    outputType: null,
  }
}

test('integration: aggregateBalances excludes spent notes from loaded nullifier set', (t) => {
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

  t.is(balances.length, 2)

  const tokenA = balances.find(b => b.token === '0xTokenA')
  t.ok(tokenA, 'TokenA balance present')
  t.is(tokenA!.balance, 300n)
  t.is(tokenA!.utxos.length, 1)
  t.is(tokenA!.utxos[0]!.nullifier, uint8ArrayToHex(unspentNullifier))

  const tokenB = balances.find(b => b.token === '0xTokenB')
  t.ok(tokenB, 'TokenB balance present')
  t.is(tokenB!.balance, 500n)
})
