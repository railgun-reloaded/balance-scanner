import type { EncryptedCommitment, Transact, TransactCommitment } from '@railgun-reloaded/scanner'
import type { Chain, NoteAnnotationData, TokenDataGetter } from '@railgun-reloaded/wallet-node'
import {
  MEMO_SENDER_RANDOM_NULL,
  Memo,
  TXIDVersion,
  decryptCommitmentAsReceiverOrSender,
  uint8ArrayToHex,
  hexToUint8Array,
} from '@railgun-reloaded/wallet-node'

import { computeNullifier } from './nullifier'
import type { DecryptedNote, DecryptedSentNote } from './types'

type TransactContext = {
  chain: Chain
  walletId: string
  txid: string
  viewingPrivateKey: Uint8Array
  viewingPublicKey: Uint8Array
  masterPublicKey: Uint8Array
  nullifyingKey: Uint8Array
  blockNumber: bigint
  tokenDataGetter: TokenDataGetter
}

type ProcessTransactResult = {
  receivedNotes: DecryptedNote[]
  sentNotes: DecryptedSentNote[]
}

type DecryptResult = {
  receivedNote: DecryptedNote | null
  sentNote: DecryptedSentNote | null
}

/**
 * Decodes the recipient's master public key from the encoded MPK in a sender decrypt.
 * If senderRandom is present and non-null, encodedMPK is raw. Otherwise XOR with sender's MPK.
 * @param encodedMPK - The encoded master public key from the decrypted commitment
 * @param senderMPK - The sender's master public key
 * @param annotationData - Decrypted annotation data containing senderRandom
 * @returns The decoded recipient master public key
 */
function decodeRecipientMPK (
  encodedMPK: Uint8Array,
  senderMPK: Uint8Array,
  annotationData: NoteAnnotationData | null
): Uint8Array {
  if (annotationData && annotationData.senderRandom !== MEMO_SENDER_RANDOM_NULL) {
    return encodedMPK
  }

  const decoded = new Uint8Array(encodedMPK.length)
  for (let i = 0; i < encodedMPK.length; i++) {
    decoded[i] = (encodedMPK[i] ?? 0) ^ (senderMPK[i] ?? 0)
  }

  return decoded
}

/**
 * Builds a DecryptedNote from a successful receiver decryption.
 * @param hash - The commitment hash
 * @param ctx - Wallet keys and block context
 * @param receiverData - Decrypted receiver data
 * @param receiverData.tokenData - Token information
 * @param receiverData.tokenData.tokenAddress - Token contract address
 * @param receiverData.value - Note value
 * @param leafIndex - Merkle tree leaf index
 * @param commitmentType - The commitment type string
 * @param annotationData - Decrypted annotation data
 * @param treeNumber - Merkle tree number
 * @returns A DecryptedNote ready for the caller to persist
 */
function buildReceivedNote (
  hash: Uint8Array,
  ctx: TransactContext,
  receiverData: { tokenData: { tokenAddress: Uint8Array }, value: bigint },
  leafIndex: bigint,
  commitmentType: string,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): DecryptedNote {
  const nullifier = computeNullifier(ctx.nullifyingKey, leafIndex)

  return {
    commitment: uint8ArrayToHex(hash),
    walletId: ctx.walletId,
    nullifier: uint8ArrayToHex(nullifier),
    token: uint8ArrayToHex(receiverData.tokenData.tokenAddress),
    amount: receiverData.value,
    blockNumber: ctx.blockNumber,
    treeId: treeNumber,
    leafIndex,
    commitmentType,
    outputType: annotationData?.outputType ?? null,
  }
}

/**
 * Builds a DecryptedSentNote from a successful sender decryption.
 * @param hash - The commitment hash
 * @param ctx - Wallet keys and block context
 * @param senderData - Decrypted sender data
 * @param senderData.tokenData - Token information
 * @param senderData.tokenData.tokenAddress - Token contract address
 * @param senderData.value - Note value
 * @param senderData.encodedMPK - Encoded master public key
 * @param leafIndex - Merkle tree leaf index
 * @param commitmentType - The commitment type string
 * @param recipientMPK - Decoded recipient master public key
 * @param annotationData - Decrypted annotation data
 * @param treeNumber - Merkle tree number
 * @returns A DecryptedSentNote ready for the caller to persist
 */
function buildSentNote (
  hash: Uint8Array,
  ctx: TransactContext,
  senderData: { tokenData: { tokenAddress: Uint8Array }, value: bigint, encodedMPK: string },
  leafIndex: bigint,
  commitmentType: string,
  recipientMPKHex: string,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): DecryptedSentNote {
  return {
    commitment: uint8ArrayToHex(hash),
    walletId: ctx.walletId,
    txid: ctx.txid,
    token: uint8ArrayToHex(senderData.tokenData.tokenAddress),
    amount: senderData.value,
    outputType: annotationData?.outputType ?? null,
    walletSource: annotationData?.walletSource ?? null,
    recipientAddress: recipientMPKHex,
    commitmentType,
    blockNumber: ctx.blockNumber,
    treeId: treeNumber,
    leafIndex,
  }
}

/**
 * Attempts decryption of a V2 TransactCommitment as both receiver and sender.
 * @param commitment - The V2 transact commitment to decrypt
 * @param ctx - Wallet keys and block context
 * @returns A DecryptResult with receivedNote and/or sentNote
 */
async function tryDecryptTransactCommitment (
  commitment: TransactCommitment,
  ctx: TransactContext
): Promise<DecryptResult> {
  if (!commitment.blindedSenderViewingKey) {
    return { receivedNote: null, sentNote: null }
  }

  const { receiverData, senderData } = await decryptCommitmentAsReceiverOrSender(
    TXIDVersion.V2_PoseidonMerkle,
    ctx.chain,
    commitment.ciphertext,
    commitment.blindedReceiverViewingKey,
    commitment.blindedSenderViewingKey,
    ctx.viewingPrivateKey,
    ctx.tokenDataGetter
  )

  if (!receiverData && !senderData) {
    return { receivedNote: null, sentNote: null }
  }

  const annotationDataRaw = Memo.decryptAnnotationData(
    commitment.annotationData,
    ctx.viewingPrivateKey
  )
  const annotationData = annotationDataRaw ?? null

  const leafIndex = BigInt(commitment.treePosition)
  let receivedNote: DecryptedNote | null = null
  let sentNote: DecryptedSentNote | null = null

  if (receiverData) {
    receivedNote = buildReceivedNote(
      commitment.hash, ctx, receiverData, leafIndex,
      'TransactCommitmentV2', annotationData, commitment.treeNumber
    )
  }

  if (senderData) {
    const encodedMPKBytes = hexToUint8Array(senderData.encodedMPK)
    const recipientMPKBytes = decodeRecipientMPK(encodedMPKBytes, ctx.masterPublicKey, annotationData)
    const recipientMPKHex = uint8ArrayToHex(recipientMPKBytes)
    sentNote = buildSentNote(
      commitment.hash, ctx, senderData, leafIndex,
      'TransactCommitmentV2', recipientMPKHex, annotationData, commitment.treeNumber
    )
  }

  return { receivedNote, sentNote }
}

/**
 * Attempts decryption of a legacy EncryptedCommitment as both receiver and sender.
 * Uses legacy ECDH (no SHA-256 hash on the shared key) and ephemeralKeys.
 * @param commitment - The legacy encrypted commitment to decrypt
 * @param ctx - Wallet keys and block context
 * @returns A DecryptResult with receivedNote and/or sentNote
 */
async function tryDecryptLegacyEncryptedCommitment (
  _commitment: EncryptedCommitment,
  _ctx: TransactContext
): Promise<DecryptResult> {
  // TODO: Legacy V1 encrypted commitments are not yet supported in reloaded wallet-node.
  // The decryption logic for ephemeralKeys-based ECDH needs to be implemented.
  // For now, return empty results.
  return { receivedNote: null, sentNote: null }
}

/**
 * Process a Transact action, attempting decryption on all commitments in parallel.
 * Handles both V2 TransactCommitments and legacy EncryptedCommitments.
 * @param action - The Transact action containing commitments
 * @param ctx - Wallet keys and block context
 * @returns Received notes and sent notes from successful decryptions
 */
export async function processTransactAction (
  action: Transact,
  ctx: TransactContext
): Promise<ProcessTransactResult> {
  const decryptionPromises = action.commitments.map(async (commitment) => {
    // Legacy (V1) commitments carry ephemeralKeys for ECDH key derivation.
    if ('ephemeralKeys' in commitment) {
      return tryDecryptLegacyEncryptedCommitment(commitment as EncryptedCommitment, ctx)
    }

    // V2 commitments use blindedSenderViewingKey/blindedReceiverViewingKey instead.
    return tryDecryptTransactCommitment(commitment as TransactCommitment, ctx)
  })

  const results = await Promise.all(decryptionPromises)
  const receivedNotes: DecryptedNote[] = []
  const sentNotes: DecryptedSentNote[] = []

  for (const result of results) {
    if (result.receivedNote) receivedNotes.push(result.receivedNote)
    if (result.sentNote) sentNotes.push(result.sentNote)
  }

  return { receivedNotes, sentNotes }
}

export type { ProcessTransactResult, TransactContext }
