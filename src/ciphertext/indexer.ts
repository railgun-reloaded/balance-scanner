import {
  parseLegacyShieldCommitment,
  parseLegacyTransactCommitment,
  parseShieldCommitment,
  parseTransactCommitment,
  parseTransactCommitmentV3
} from './parser'
import type { CiphertextIndexKey, CiphertextIndexerOptions, CommitmentEvent, IndexConfig, IndexedCiphertextRecord, PrimaryIndexOption } from './types'
import { COMMITMENT_TYPE } from './types'
import { hasCiphertext } from './utils'

/**
 * In-memory indexer for mapping commitment hashes to ciphertexts from CommitmentBatch events.
 */
class CiphertextIndexer {
  /** Internal map of commitment hash to IndexedCiphertextRecord */
  #index: Map<CiphertextIndexKey, IndexedCiphertextRecord> = new Map()
  /** Secondary indexes: field -> set of hashes */
  #secondaryIndexes: Map<string, Map<string, Set<CiphertextIndexKey>>> = new Map()
  /** Primary field for indexing (string or function) */
  private primaryFieldOrFn: PrimaryIndexOption
  /** Secondary fields for indexing */
  private secondaryFields: string[]
  /** Source of CommitmentBatch events */
  private dataProvider: AsyncIterable<CommitmentEvent> | CommitmentEvent[]
  /** If set, only index events with blockNumber >= fromBlock */
  private fromBlock: number | undefined
  /** If set, only index events with blockNumber <= toBlock */
  private toBlock: number | undefined
  /** Optional decode function for getDecoded */
  private decodeFn?: (record: IndexedCiphertextRecord, viewingKey: string) => unknown

  /**
   * Create a CiphertextIndexer.
   * @param dataProvider Source of CommitmentBatch events (array or async iterable)
   * @param options Indexer options
   */
  constructor (
    dataProvider: AsyncIterable<CommitmentEvent> | CommitmentEvent[],
    options: CiphertextIndexerOptions = {}
  ) {
    this.dataProvider = dataProvider
    const indexConfig = this.getIndexConfig(options)
    this.primaryFieldOrFn = indexConfig.primary
    this.secondaryFields = (indexConfig.secondary || []).map(f => String(f)) // Cast to string
    for (const field of this.secondaryFields) {
      this.#secondaryIndexes.set(field, new Map())
    }
    this.fromBlock = options.fromBlock
    this.toBlock = options.toBlock
    if (options.decodeFn) this.decodeFn = options.decodeFn
  }

  /**
   * Parse config for indexer
   * @param options Indexer options
   * @returns IndexConfig
   */
  getIndexConfig (options: CiphertextIndexerOptions): IndexConfig {
    return options.indexConfig || {
      primary: 'commitmentHash',
      secondary: []
    }
  }

  /**
   * Initialize the indexer and start indexing CommitmentBatch events.
   * @returns Promise that resolves when indexing is complete (or stopped)
   */
  async initialize (): Promise<void> {
    if (Symbol.asyncIterator in this.dataProvider) {
      for await (const event of this.dataProvider as AsyncIterable<CommitmentEvent>) {
        this.addFromEvent(event)
      }
    } else {
      for (const event of this.dataProvider as CommitmentEvent[]) {
        this.addFromEvent(event)
      }
    }
  }

  /**
   * Add a single ciphertext record from an event (delegates to handler functions).
   * @param event Commitment event
   */
  addFromEvent (event: CommitmentEvent): void {
    if (
      (this.fromBlock !== undefined && event.blockNumber < this.fromBlock) ||
      (this.toBlock !== undefined && event.blockNumber > this.toBlock) ||
      !hasCiphertext(event)
    ) {
      return
    }
    let record: IndexedCiphertextRecord | undefined

    switch (event.args['commitmentType']) {
      case COMMITMENT_TYPE.LegacyTransactCommitment:
        record = parseLegacyTransactCommitment(event)
        break
      case COMMITMENT_TYPE.LegacyShieldCommitment:
        record = parseLegacyShieldCommitment(event)
        break
      case COMMITMENT_TYPE.TransactCommitment:
        record = parseTransactCommitment(event)
        break
      case COMMITMENT_TYPE.ShieldCommitment:
        record = parseShieldCommitment(event)
        break
      case COMMITMENT_TYPE.TransactCommitmentV3:
        record = parseTransactCommitmentV3(event)
        break
      default:
        return
    }
    if (!record) return
    let primaryKey: CiphertextIndexKey
    if (typeof this.primaryFieldOrFn === 'function') {
      primaryKey = this.primaryFieldOrFn(record)
    } else {
      const keyValue = record[this.primaryFieldOrFn]
      if (typeof keyValue !== 'string') throw new Error('Primary key must exist and be a string')
      primaryKey = keyValue
    }

    const existingRecord = this.get(primaryKey)

    if (existingRecord) {
      console.warn(`⚠️ Index for key ${primaryKey} already exists. Skipping...`)

      return
    };

    this.#index.set(primaryKey, record)
    for (const field of this.secondaryFields) {
      const value = String(record[field])
      let idx = this.#secondaryIndexes.get(field)
      if (!idx) {
        idx = new Map()
        this.#secondaryIndexes.set(field, idx)
      }
      if (!idx.has(value)) {
        idx.set(value, new Set<CiphertextIndexKey>())
      }
      idx.get(value)!.add(primaryKey)
    }
  }

  /**
   * Set or update the decode function.
   * @param decodeFn Function to decode a record with a viewing key
   */
  setDecodeFunction (decodeFn: (record: IndexedCiphertextRecord, viewingKey: string) => unknown): void {
    this.decodeFn = decodeFn
  }

  /**
   * Fetch from index and decode using the view key.
   * @param indexKey The value of the primary index field (or composite key if using a function)
   * @param viewingKey Viewing key to decode the cipherdata
   * @returns The decoded record or undefined if not found or no decode function set
   */
  getDecoded (indexKey: CiphertextIndexKey, viewingKey: string): unknown {
    if (!this.decodeFn) throw new Error('No decode function set')
    const record = this.get(indexKey)
    if (!record) return undefined
    return this.decodeFn(record, viewingKey)
  }

  /**
   * Get the record for a given primary key.
   * @param primaryKey The value of the primary index field (or composite key if using a function)
   * @returns The IndexedCiphertextRecord or undefined if not found
   */
  get (primaryKey: CiphertextIndexKey): IndexedCiphertextRecord | undefined {
    return this.#index.get(primaryKey)
  }

  /**
   * Get indexed data count
   * @returns number
   */
  getCount (): number {
    return this.#index.size
  }

  /**
   * Check if a primary key exists in the index.
   * @param primaryKey The value of the primary index field (or composite key if using a function)
   * @returns True if the key exists, false otherwise
   */
  exists (primaryKey: CiphertextIndexKey): boolean {
    return this.#index.has(primaryKey)
  }

  /**
   * Generic secondary index lookup
   * @param field The secondary index field
   * @param value The value to look up
   * @returns Array of IndexedCiphertextRecord
   */
  getBy (field: string, value: string): IndexedCiphertextRecord[] {
    const idx = this.#secondaryIndexes.get(field)

    if (!idx) return []
    const keys = idx.get(String(value))

    if (!keys) return []
    return Array.from(keys).map(key => this.#index.get(key)!).filter((rec): rec is IndexedCiphertextRecord => Boolean(rec))
  }

  /**
   * Get all primary keys in the index.
   * @returns Array of all primary keys
   */
  getAllPrimaryKeys (): CiphertextIndexKey[] {
    return Array.from(this.#index.keys())
  }
}

export { CiphertextIndexer }
