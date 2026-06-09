import { TokenType } from '@railgun-reloaded/wallet-node'

/**
 * A note successfully decrypted by the wallet as receiver or from a shield.
 * `tokenType` is the token-class enum (`TokenType.ERC20`, `TokenType.ERC721`).
 * `tokenSubID` is a 32-byte sub-identifier exposed as 0x-prefixed lowercase
 * hex; for ERC20 it is the canonical 256-bit null.
 */
type DecryptedNote = {
  commitment: string
  walletId: string
  nullifier: string
  token: string
  amount: bigint
  tokenType: TokenType
  tokenSubID: string
  blockNumber: bigint
  treeId: number
  leafIndex: bigint
  commitmentType: string
  outputType: number | null
  npk?: string
  random?: string
  chainId: number
  creationTxid?: Uint8Array
  creationRailgunTxid?: Uint8Array
}

/**
 * A sent note successfully decrypted by the wallet as sender.
 */
type DecryptedSentNote = {
  commitment: string
  walletId: string
  txid: string
  token: string
  amount: bigint
  outputType: number | null
  walletSource: string | null
  recipientAddress: string
  commitmentType: string
  blockNumber: bigint
  treeId: number
  leafIndex: bigint
  chainId: number
}

/**
 * Minimal note info used for nullifier matching.
 */
type SpentNoteInfo = {
  commitment: string
  nullifier: string
  token: string
  amount: bigint
}

export { TokenType }
export type { DecryptedNote, DecryptedSentNote, SpentNoteInfo }
