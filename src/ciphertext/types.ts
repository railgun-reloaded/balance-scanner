enum CommitmentType {
  LegacyTransactCommitment = 'LegacyTransactCommitment',
  LegacyShieldCommitment = 'LegacyShieldCommitment',
  TransactCommitment = 'TransactCommitment',
  ShieldCommitment = 'ShieldCommitment',
  TransactCommitmentV3 = 'TransactCommitmentV3',
  ShieldCommitmentV3 = 'ShieldCommitmentV3',
}

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

interface TokenData {
  id: string;
  tokenType: string;
  tokenSubID?: string;
  tokenAddress: string;
}

interface ShieldCommitmentPreImage {
  npk: string;
  value: string;
  token: TokenData
}

interface ShieldCommitmentArgs extends BaseCommitmentArgs {
  encryptedBundle: string[];
  preimage: ShieldCommitmentPreImage
}

interface TransactCommitmentArgs extends BaseCommitmentArgs {
  ciphertext: CommitmentCiphertext;
}

type CommitmentArgs = TransactCommitmentArgs | ShieldCommitmentArgs

interface CommitmentEvent {
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

type IndexedCiphertextRecord = IndexedTransactCommitmentRecord | IndexedShieldCommitmentRecord & {
  [key: string]: unknown;
}

type CiphertextIndexKey = string

type PrimaryIndexOption = CiphertextIndexKey | ((record: IndexedCiphertextRecord) => string)
interface IndexConfig {
  primary: PrimaryIndexOption
  secondary?: (keyof IndexedCiphertextRecord)[];
}

interface CiphertextIndexerOptions {
  indexConfig?: IndexConfig;
  fromBlock?: number;
  toBlock?: number;
  decodeFn?: (record: IndexedCiphertextRecord, viewingKey: string) => unknown;
}

export type { CommitmentEvent, IndexedCiphertextRecord, IndexConfig, CiphertextIndexerOptions, CiphertextIndexKey, PrimaryIndexOption, IndexedTransactCommitmentRecord }
export { CommitmentType }
