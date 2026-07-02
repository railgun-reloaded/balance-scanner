import crypto from 'crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ChainStorage } from '@railgun-reloaded/storage'
import { createChainDB, createChainStorage } from '@railgun-reloaded/storage/node'

import { NullifierCache } from '../src/nullifier-cache.js'
import { loadNullifierSet } from '../src/nullifier-store.js'

/**
 * Generate random bytes of given size.
 * @param size - Number of random bytes.
 * @returns Random Uint8Array.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/**
 * Create a chain storage backed by an in-memory database for testing.
 * @returns ChainStorage instance.
 */
async function createTestStorage (): Promise<ChainStorage> {
  const db = await createChainDB({
    path: ':memory:',
    runMigrations: true
  })
  return createChainStorage(db)
}

const NULLIFIER_COUNT = 1_000_000
const BATCH_SIZE = 500
const MAX_LOAD_TIME_MS = 60_000

test(`benchmark: loading ${NULLIFIER_COUNT} nullifiers in <${MAX_LOAD_TIME_MS}ms`, async () => {
  const storage = await createTestStorage()

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
    await storage.insertNullifiersBatch(batch)
  }
  const insertTime = Date.now() - insertStart
  console.log(`Insert ${NULLIFIER_COUNT} nullifiers: ${insertTime}ms`)

  const loadStart = Date.now()
  const set = await loadNullifierSet(storage)
  const loadTime = Date.now() - loadStart

  console.log(`Full load ${set.size} nullifiers: ${loadTime}ms`)
  assert.equal(set.size, NULLIFIER_COUNT)
  assert.ok(loadTime < MAX_LOAD_TIME_MS, `Load time ${loadTime}ms should be < ${MAX_LOAD_TIME_MS}ms`)

  const cache = new NullifierCache()
  await cache.initialize(storage)
  const updateStart = Date.now()
  await cache.update(storage)
  const updateTime = Date.now() - updateStart

  console.log(`Incremental update (0 new): ${updateTime}ms`)
  assert.ok(updateTime < 100, `Incremental update ${updateTime}ms should be < 100ms`)
})
