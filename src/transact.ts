import { bytesToHex, hexToBytes } from '@railgun-reloaded/bytes'
import type { EncryptedCommitment, Transact, TransactCommitment } from '@railgun-reloaded/scanner'
import type { Chain, DecryptedCommitmentData, NoteAnnotationData, TokenDataGetter } from '@railgun-reloaded/wallet-node'
import {
  MEMO_SENDER_RANDOM_NULL,
  Memo,
  Note,
  TXIDVersion,
  decryptCommitmentAsReceiverOrSender,
} from '@railgun-reloaded/wallet-node'

import { computeNullifier } from './nullifier.js'
import type { DecryptedNote, DecryptedSentNote } from './types.js'

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
 * @param receiverData.tokenData.tokenType - Token-class enum (0 = ERC20, 1 = ERC721)
 * @param receiverData.tokenData.tokenSubID - 32-byte sub-identifier (zero for ERC20)
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
  receiverData: DecryptedCommitmentData,
  leafIndex: bigint,
  commitmentType: string,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): DecryptedNote {
  const nullifier = computeNullifier(ctx.nullifyingKey, leafIndex)
  const npk = Note.computeNotePublicKey(
    ctx.masterPublicKey,
    hexToBytes(receiverData.random)
  )

  return {
    commitment: bytesToHex(hash, { prefix: true }),
    walletId: ctx.walletId,
    chainId: ctx.chain.id,
    nullifier: bytesToHex(nullifier, { prefix: true }),
    token: bytesToHex(receiverData.tokenData.tokenAddress, { prefix: true }),
    amount: receiverData.value,
    tokenType: receiverData.tokenData.tokenType,
    tokenSubID: bytesToHex(receiverData.tokenData.tokenSubID, { prefix: true }),
    blockNumber: ctx.blockNumber,
    treeId: treeNumber,
    leafIndex,
    commitmentType,
    outputType: annotationData?.outputType ?? null,
    npk: bytesToHex(npk, { prefix: true }),
    random: receiverData.random,
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
 * @param recipientMPKHex - Recipient master public key as 0x-prefixed hex
 * @param annotationData - Decrypted annotation data
 * @param treeNumber - Merkle tree number
 * @returns A DecryptedSentNote ready for the caller to persist
 */
function buildSentNote (
  hash: Uint8Array,
  ctx: TransactContext,
  senderData: DecryptedCommitmentData,
  leafIndex: bigint,
  commitmentType: string,
  recipientMPKHex: string,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): DecryptedSentNote {
  return {
    commitment: bytesToHex(hash, { prefix: true }),
    walletId: ctx.walletId,
    txid: ctx.txid,
    chainId: ctx.chain.id,
    token: bytesToHex(senderData.tokenData.tokenAddress, { prefix: true }),
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
    commitment.memo,
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
    const encodedMPKBytes = hexToBytes(senderData.encodedMPK)
    const recipientMPKBytes = decodeRecipientMPK(encodedMPKBytes, ctx.masterPublicKey, annotationData)
    const recipientMPKHex = bytesToHex(recipientMPKBytes, { prefix: true })
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
 * @param _commitment - The legacy encrypted commitment to decrypt (unused; legacy path not implemented)
 * @param _ctx - Wallet keys and block context (unused; legacy path not implemented)
 * @returns A DecryptResult with receivedNote and/or sentNote
 */
async function tryDecryptLegacyEncryptedCommitment (
  _commitment: EncryptedCommitment,
  _ctx: TransactContext
): Promise<DecryptResult> {
  // TODO(v1-legacy): Legacy V1 encrypted commitments are not yet supported in reloaded wallet-node.
  // The decryption logic for ephemeralKeys-based ECDH needs to be implemented.
  // When implemented, align memo handling with V2 (flattened Uint8Array; empty → no append)
  // and emit a sentNote alongside the receivedNote for self-sends.
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
