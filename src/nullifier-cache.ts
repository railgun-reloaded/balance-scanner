import { bytesToHex } from '@railgun-reloaded/bytes'
import type { ChainDB } from '@railgun-reloaded/storage/node'
import { getAllNullifiers, getNullifiersFromBlock } from '@railgun-reloaded/storage/node'

/**
 * In-memory cache for nullifier hex strings with block-tracked incremental updates.
 * One instance per chain. The caller manages lifecycle.
 */
class NullifierCache {
  /** The set of 0x-prefixed hex nullifier strings. */
  #set: Set<string>
  /** Highest block number loaded into the cache, or -1n if empty. */
  #lastBlockLoaded: bigint
  /** Whether the cache has been initialized at least once. */
  #initialized: boolean

  /** Create a new empty cache. */
  constructor () {
    this.#set = new Set()
    this.#lastBlockLoaded = -1n
    this.#initialized = false
  }

  /**
   * Load all nullifiers from the chain database into the cache.
   * @param chainDb - Chain database instance.
   */
  async initialize (chainDb: ChainDB): Promise<void> {
    this.#set.clear()
    this.#lastBlockLoaded = -1n
    const rows = await getAllNullifiers(chainDb)
    for (const row of rows) {
      this.#set.add(bytesToHex(row.nullifier as Uint8Array, { prefix: true }))
      if (row.blockNumber > this.#lastBlockLoaded) {
        this.#lastBlockLoaded = row.blockNumber
      }
    }
    this.#initialized = true
  }

  /**
   * Incrementally update the cache with nullifiers added since the last loaded block.
   * @param chainDb - Chain database instance.
   * @returns Number of new nullifiers added to the cache.
   */
  async update (chainDb: ChainDB): Promise<number> {
    if (!this.#initialized) {
      await this.initialize(chainDb)
      return this.#set.size
    }

    const rows = await getNullifiersFromBlock(chainDb, this.#lastBlockLoaded + 1n)
    for (const row of rows) {
      this.#set.add(bytesToHex(row.nullifier as Uint8Array, { prefix: true }))
      if (row.blockNumber > this.#lastBlockLoaded) {
        this.#lastBlockLoaded = row.blockNumber
      }
    }
    return rows.length
  }

  /**
   * Clear and reload the cache after a chain reorganization.
   * Call this after deleteNullifiersFromBlock has been applied to the DB.
   * @param chainDb - Chain database instance.
   */
  async handleReorg (chainDb: ChainDB): Promise<void> {
    this.#lastBlockLoaded = -1n
    this.#initialized = false
    await this.initialize(chainDb)
  }

  /**
   * Add a hex nullifier directly to the cache without a DB query.
   * Used by syncNullifiers to keep cache in sync with writes.
   * @param hex - The 0x-prefixed hex nullifier string.
   * @param blockNumber - The block number of this nullifier.
   */
  addDirect (hex: string, blockNumber: bigint): void {
    this.#set.add(hex)
    if (blockNumber > this.#lastBlockLoaded) {
      this.#lastBlockLoaded = blockNumber
    }
  }

  /**
   * The set of 0x-prefixed hex nullifier strings.
   * @returns The underlying set of cached nullifiers.
   */
  get nullifiers (): Set<string> {
    return this.#set
  }

  /**
   * Number of nullifiers in the cache.
   * @returns The cache size.
   */
  get size (): number {
    return this.#set.size
  }

  /**
   * Highest block number loaded into the cache, or -1n if empty.
   * @returns The last block number ingested into the cache.
   */
  get lastBlock (): bigint {
    return this.#lastBlockLoaded
  }

  /**
   * Whether the cache has been initialized at least once.
   * @returns True once the cache has been populated from storage.
   */
  get isInitialized (): boolean {
    return this.#initialized
  }
}

export { NullifierCache }
