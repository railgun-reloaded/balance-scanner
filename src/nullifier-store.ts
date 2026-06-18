import { bytesToHex } from '@railgun-reloaded/bytes'
import type { Transact } from '@railgun-reloaded/scanner'
import type { ChainDB } from '@railgun-reloaded/storage'
import {
  getAllNullifiers,
  insertNullifiersBatch,
} from '@railgun-reloaded/storage'

import type { NullifierCache } from './nullifier-cache.js'

/**
 * Extract nullifiers from Transact events and persist them to the chain database.
 * Optionally updates a NullifierCache to keep it in sync.
 * @param chainDb - Chain database instance.
 * @param events - Transact events containing nullifiers.
 * @param blockNumber - Block number these events occurred at.
 * @param transactionHash - Transaction hash for the events.
 * @param cache - Optional nullifier cache to update.
 */
async function syncNullifiers (
  chainDb: ChainDB,
  events: Transact[],
  blockNumber: bigint,
  transactionHash: Uint8Array,
  cache?: NullifierCache
): Promise<void> {
  const batch = []

  for (const event of events) {
    for (const nullifier of event.nullifiers) {
      batch.push({
        nullifier,
        transactionHash,
        blockNumber,
        treeNumber: event.utxoTreeIn,
      })
    }
  }

  if (batch.length === 0) return

  await insertNullifiersBatch(chainDb, batch)

  if (cache) {
    for (const entry of batch) {
      cache.addDirect(bytesToHex(entry.nullifier, { prefix: true }), blockNumber)
    }
  }
}

/**
 * Load all nullifiers into a Set of hex strings for balance calculations.
 * Uses the cache for incremental loading when available.
 * @param chainDb - Chain database instance.
 * @param cache - Optional NullifierCache for incremental loading.
 * @returns Set of 0x-prefixed hex nullifier strings.
 */
async function loadNullifierSet (
  chainDb: ChainDB,
  cache?: NullifierCache
): Promise<Set<string>> {
  if (cache) {
    if (!cache.isInitialized) {
      await cache.initialize(chainDb)
    } else {
      await cache.update(chainDb)
    }
    return cache.nullifiers
  }

  const rows = await getAllNullifiers(chainDb)
  const set = new Set<string>()
  for (const row of rows) {
    set.add(bytesToHex(row.nullifier as Uint8Array, { prefix: true }))
  }
  return set
}

export { syncNullifiers, loadNullifierSet }
