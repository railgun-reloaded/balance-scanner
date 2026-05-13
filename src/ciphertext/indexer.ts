import {
  parseLegacyShieldCommitment,
  parseLegacyTransactCommitment,
  parseShieldCommitment,
  parseTransactCommitment,
  parseTransactCommitmentV3
} from './parser'
import type { CiphertextIndexKey, CiphertextIndexerOptions, CommitmentEvent, IndexConfig, IndexedCiphertextRecord, PrimaryIndexOption } from './types'
import { CommitmentType } from './types'
import { hasCiphertext } from './utils'

/**
 * In-memory indexer for mapping commitment hashes to ciphertexts from CommitmentBatch events.
 */
class CiphertextIndexer {
  /** Primary index: primary key → indexed ciphertext record. */
  #index: Map<CiphertextIndexKey, IndexedCiphertextRecord> = new Map()
  /** Secondary indexes: field name → (value → set of primary keys). */
  #secondaryIndexes: Map<string, Map<string, Set<CiphertextIndexKey>>> = new Map()
  /** Primary-key strategy: either a record field name or a function deriving the key from a record. */
  private primaryFieldOrFn: PrimaryIndexOption
  /** Record fields to maintain secondary indexes on. */
  private secondaryFields: string[]
  /** Source of CommitmentBatch events — either an in-memory array or an async iterable. */
  private dataProvider: AsyncIterable<CommitmentEvent> | CommitmentEvent[]
  /** Optional lower bound on event block number; events below this are skipped. */
  private fromBlock: number | undefined
  /** Optional upper bound on event block number; events above this are skipped. */
  private toBlock: number | undefined
  /** Optional decode function applied by {@link getDecoded} to convert a record into a higher-level value. */
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
   * Resolve the active index config, falling back to a `commitmentHash` primary with no secondaries.
   * @param options - Indexer options supplied by the caller.
   * @returns The effective {@link IndexConfig}.
   */
  getIndexConfig (options: CiphertextIndexerOptions): IndexConfig {
    return options.indexConfig || {
      primary: 'commitmentHash',
      secondary: []
    }
  }

  /**
   * Consume every event from the configured data provider and populate the indexes.
   * @returns A promise that resolves once all events have been ingested.
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
   * Parse a single CommitmentEvent and add the resulting record to the primary and secondary indexes.
   * Events outside the fromBlock/toBlock window, events without ciphertext, and events with unknown
   * commitment types are skipped. Duplicate primary keys are logged and ignored.
   * @param event - The CommitmentBatch event to index.
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
      case CommitmentType.LegacyTransactCommitment:
        record = parseLegacyTransactCommitment(event)
        break
      case CommitmentType.LegacyShieldCommitment:
        record = parseLegacyShieldCommitment(event)
        break
      case CommitmentType.TransactCommitment:
        record = parseTransactCommitment(event)
        break
      case CommitmentType.ShieldCommitment:
        record = parseShieldCommitment(event)
        break
      case CommitmentType.TransactCommitmentV3:
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
      console.warn(`[balance-scanner] Index for key ${primaryKey} already exists. Skipping...`)

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
   * Register a decode function used by {@link getDecoded} to transform stored records into a caller-defined value.
   * @param decodeFn - Function invoked with the indexed record and a viewing key.
   */
  setDecodeFunction (decodeFn: (record: IndexedCiphertextRecord, viewingKey: string) => unknown): void {
    this.decodeFn = decodeFn
  }

  /**
   * Look up a record by primary key and run the configured decode function against it.
   * @param indexKey - Primary key of the record to decode.
   * @param viewingKey - Viewing key forwarded to the decode function.
   * @returns The decoded value, or `undefined` if no record is indexed under `indexKey`.
   */
  getDecoded (indexKey: CiphertextIndexKey, viewingKey: string): unknown {
    if (!this.decodeFn) throw new Error('No decode function set')
    const record = this.get(indexKey)
    if (!record) return undefined
    return this.decodeFn(record, viewingKey)
  }

  /**
   * Fetch a record by primary key.
   * @param primaryKey - The primary key to look up.
   * @returns The indexed record, or `undefined` if no such record exists.
   */
  get (primaryKey: CiphertextIndexKey): IndexedCiphertextRecord | undefined {
    return this.#index.get(primaryKey)
  }

  /**
   * Total number of records currently indexed.
   * @returns The primary-index size.
   */
  getCount (): number {
    return this.#index.size
  }

  /**
   * Test whether a primary key is present in the index.
   * @param primaryKey - The primary key to test.
   * @returns True if a record with this primary key has been indexed.
   */
  exists (primaryKey: CiphertextIndexKey): boolean {
    return this.#index.has(primaryKey)
  }

  /**
   * Look up records via a secondary index.
   * @param field - The secondary index field name (must have been registered at construction).
   * @param value - The value to match in that field.
   * @returns All records whose `field` value equals `value`, or an empty array if none match.
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
