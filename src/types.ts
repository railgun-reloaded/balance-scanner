/**
 * A note successfully decrypted by the wallet as receiver or from a shield.
 */
type DecryptedNote = {
  commitment: string
  walletId: string
  nullifier: string
  token: string
  amount: bigint
  blockNumber: bigint
  treeId: number
  leafIndex: bigint
  commitmentType: string
  outputType: number | null
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

export type { DecryptedNote, DecryptedSentNote, SpentNoteInfo }
