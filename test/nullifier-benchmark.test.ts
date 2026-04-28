import crypto from 'crypto'

import type { ChainDB } from '@railgun-reloaded/storage'
import {
  createChainDB,
  insertNullifiersBatch,
} from '@railgun-reloaded/storage'
import { test } from 'brittle'

import { NullifierCache } from '../src/nullifier-cache'
import { loadNullifierSet } from '../src/nullifier-store'

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

const NULLIFIER_COUNT = 1_000_000
const BATCH_SIZE = 500
const MAX_LOAD_TIME_MS = 10_000

test(`benchmark: loading ${NULLIFIER_COUNT} nullifiers in <${MAX_LOAD_TIME_MS}ms`, (t) => {
  const db = createTestDb()

  const insertStart = Date.now()
  for (let i = 0; i < NULLIFIER_COUNT; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, NULLIFIER_COUNT - i)
    const batch = []
    for (let j = 0; j < batchSize; j++) {
      batch.push({
        nullifier: randomBytes(32),
        transactionHash: randomBytes(32),
        blockNumber: BigInt(i + j),
        treeNumber: 0,
      })
    }
    insertNullifiersBatch(db, batch)
  }
  const insertTime = Date.now() - insertStart
  t.comment(`Insert ${NULLIFIER_COUNT} nullifiers: ${insertTime}ms`)

  const loadStart = Date.now()
  const set = loadNullifierSet(db)
  const loadTime = Date.now() - loadStart

  t.comment(`Full load ${set.size} nullifiers: ${loadTime}ms`)
  t.is(set.size, NULLIFIER_COUNT)
  t.ok(loadTime < MAX_LOAD_TIME_MS, `Load time ${loadTime}ms should be < ${MAX_LOAD_TIME_MS}ms`)

  const cache = new NullifierCache()
  cache.initialize(db)
  const updateStart = Date.now()
  cache.update(db)
  const updateTime = Date.now() - updateStart

  t.comment(`Incremental update (0 new): ${updateTime}ms`)
  t.ok(updateTime < 100, `Incremental update ${updateTime}ms should be < 100ms`)
})
