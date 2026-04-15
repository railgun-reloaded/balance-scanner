/**
 * Ciphertext indexer for RAILGUN commitments
 *
 * Internal module for indexing encrypted note data from blockchain events.
 * Consolidated from standalone @railgun-reloaded/ciphertext-indexer package.
 */

export { CiphertextIndexer } from './indexer'
export type {
  CommitmentEvent,
  IndexedCiphertextRecord,
  IndexConfig,
  CiphertextIndexerOptions,
  CommitmentType,
  IndexedTransactCommitmentRecord
} from './types'
export { COMMITMENT_TYPE } from './types'
