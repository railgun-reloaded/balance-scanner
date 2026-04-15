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
  #index: Map<CiphertextIndexKey, IndexedCiphertextRecord> = new Map()
  #secondaryIndexes: Map<string, Map<string, Set<CiphertextIndexKey>>> = new Map()
  private primaryFieldOrFn: PrimaryIndexOption
  private secondaryFields: string[]
  private dataProvider: AsyncIterable<CommitmentEvent> | CommitmentEvent[]
  private fromBlock: number | undefined
  private toBlock: number | undefined
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

  getIndexConfig (options: CiphertextIndexerOptions): IndexConfig {
    return options.indexConfig || {
      primary: 'commitmentHash',
      secondary: []
    }
  }

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

  setDecodeFunction (decodeFn: (record: IndexedCiphertextRecord, viewingKey: string) => unknown): void {
    this.decodeFn = decodeFn
  }

  getDecoded (indexKey: CiphertextIndexKey, viewingKey: string): unknown {
    if (!this.decodeFn) throw new Error('No decode function set')
    const record = this.get(indexKey)
    if (!record) return undefined
    return this.decodeFn(record, viewingKey)
  }

  get (primaryKey: CiphertextIndexKey): IndexedCiphertextRecord | undefined {
    return this.#index.get(primaryKey)
  }

  getCount (): number {
    return this.#index.size
  }

  exists (primaryKey: CiphertextIndexKey): boolean {
    return this.#index.has(primaryKey)
  }

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
