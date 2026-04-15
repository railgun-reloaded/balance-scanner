/**
 * Commitment type string constants for clarity and type safety.
 */
enum COMMITMENT_TYPE {
  LegacyTransactCommitment = 'LegacyTransactCommitment',
  LegacyShieldCommitment = 'LegacyShieldCommitment',
  TransactCommitment = 'TransactCommitment',
  ShieldCommitment = 'ShieldCommitment',
  TransactCommitmentV3 = 'TransactCommitmentV3',
  ShieldCommitmentV3 = 'ShieldCommitmentV3',
}
type CommitmentType = typeof COMMITMENT_TYPE[keyof typeof COMMITMENT_TYPE]

/**
 * CommitmentData args
 */
interface CiphertextData {
  iv: string;
  tag: string;
  data: string[];
}

interface CommitmentCiphertext {
  ciphertext: CiphertextData;
  blindedSenderViewingKey: string,
  blindedReceiverViewingKey: string,
  annotationData: string,
  memo: string
}

/**
 * Base Commitment args
 */
interface BaseCommitmentArgs {
  id: string;
  treeNumber: number;
  batchStartTreePosition: number;
  treePosition: number;
  blockNumber: string;
  transactionHash: string;
  blockTimestamp: string;
  commitmentType: string;
  hash: string;
  name: CommitmentType;
  startPosition: string | number;
};

/** SHIELD COMMITMENT TYPE START */

/**
 * Tokendata interface for ShieldCommitment
 */
interface TokenData {
  id: string;
  tokenType: string;
  tokenSubID?: string;
  tokenAddress: string;
}

/**
 * Shieldcommitment preimage inteface
 */
interface ShieldCommitmentPreImage {
  npk: string;
  value: string;
  token: TokenData
}

/**
 * Commitment interface related to ShieldCommitment args
 */
interface ShieldCommitmentArgs extends BaseCommitmentArgs {
  encryptedBundle: string[];
  preimage: ShieldCommitmentPreImage
}
/** SHIELD COMMITMENT TYPE END */

/**
 * Commitment interface related to TransactCommitment args
 */
interface TransactCommitmentArgs extends BaseCommitmentArgs {
  ciphertext: CommitmentCiphertext;
}

type CommitmentArgs = TransactCommitmentArgs | ShieldCommitmentArgs

/**
 * Represents a CommitmentBatch event containing hashes and ciphertexts.
 */
interface CommitmentEvent {
  // @TODO: Create enum or type with possible values
  name: string;
  blockNumber: number;
  transactionIndex: number;
  transactionHash: string;
  logIndex: number;
  args: CommitmentArgs;
}

type IndexedTransactCommitmentRecord = Partial<{
  ciphertext: CiphertextData;
  blindedSenderViewingKey: string;
  blindedReceiverViewingKey: string;
  annotationData: string;
  memo: string;
  transactionHash: string;
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  treeNumber: number;
  treePosition: number;
  eventName: string;
  commitmentHash: string;
}> & { [key: string]: unknown }

type IndexedShieldCommitmentRecord = Partial<{
  encryptedBundle: string[];
  preimage: ShieldCommitmentPreImage;
  transactionHash: string;
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  treeNumber: number;
  treePosition: number;
  eventName: string;
  commitmentHash: string;
}> & { [key: string]: unknown }

/**
 * Represents a record indexed by commitment hash, including ciphertext and event name.
 */
type IndexedCiphertextRecord = IndexedTransactCommitmentRecord | IndexedShieldCommitmentRecord & {
  [key: string]: unknown;
}

type CiphertextIndexKey = string

type PrimaryIndexOption = CiphertextIndexKey | ((record: IndexedCiphertextRecord) => string)
/**
 * Options for CiphertextIndexer
 */
interface IndexConfig {
  primary: PrimaryIndexOption
  secondary?: (keyof IndexedCiphertextRecord)[];
}

/**
 * Ciphertext Indexer Options
 */
interface CiphertextIndexerOptions {
  indexConfig?: IndexConfig;
  fromBlock?: number;
  toBlock?: number;
  decodeFn?: (record: IndexedCiphertextRecord, viewingKey: string) => unknown;
}

export type { CommitmentEvent, IndexedCiphertextRecord, IndexConfig, CiphertextIndexerOptions, CiphertextIndexKey, PrimaryIndexOption, IndexedTransactCommitmentRecord, CommitmentType }
export { COMMITMENT_TYPE }
