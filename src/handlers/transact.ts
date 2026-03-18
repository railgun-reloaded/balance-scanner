import type { EncryptedCommitment, Transact, TransactCommitment } from '@railgun-reloaded/scanner'
import type { Chain, NoteAnnotationData, TokenDataGetter } from '@railgun-reloaded/wallet-node'
import {
  MEMO_SENDER_RANDOM_NULL,
  Memo,
  Note,
  TXIDVersion,
  decryptCommitmentAsReceiverOrSender,
  decryptLegacyCommitmentAsReceiverOrSender,
  uint8ArrayToHex,
} from '@railgun-reloaded/wallet-node'
import type { NewNote, NewSentNote } from '@reloaded/storage/wallet'

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
  receivedNotes: NewNote[]
  sentNotes: NewSentNote[]
}

type DecryptResult = {
  receivedNote: NewNote | null
  sentNote: NewSentNote | null
}

/**
 * Decodes the recipient's master public key from the encoded MPK in a sender decrypt.
 * If senderRandom is present and non-null, encodedMPK is raw. Otherwise XOR with sender's MPK.
 * @param encodedMPK - The encoded master public key from the decrypted commitment
 * @param senderMPK - The sender's (our) master public key
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
 * Builds a NewNote from a successful receiver decryption.
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
 * @returns A NewNote for storage
 */
function buildReceivedNote (
  hash: Uint8Array,
  ctx: TransactContext,
  receiverData: { tokenData: { tokenAddress: Uint8Array }, value: bigint },
  leafIndex: bigint,
  commitmentType: string,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): NewNote {
  const nullifier = Note.computeNullifier(ctx.nullifyingKey, leafIndex)
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
 * Builds a NewSentNote from a successful sender decryption.
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
 * @returns A NewSentNote for storage
 */
function buildSentNote (
  hash: Uint8Array,
  ctx: TransactContext,
  senderData: { tokenData: { tokenAddress: Uint8Array }, value: bigint, encodedMPK: Uint8Array },
  leafIndex: bigint,
  commitmentType: string,
  recipientMPK: Uint8Array,
  annotationData: NoteAnnotationData | null,
  treeNumber: number
): NewSentNote {
  return {
    commitment: uint8ArrayToHex(hash),
    walletId: ctx.walletId,
    txid: ctx.txid,
    token: uint8ArrayToHex(senderData.tokenData.tokenAddress),
    amount: senderData.value,
    outputType: annotationData?.outputType ?? null,
    walletSource: annotationData?.walletSource ?? null,
    recipientAddress: uint8ArrayToHex(recipientMPK),
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

  const annotationData = Memo.decryptAnnotationData(
    commitment.annotationData,
    ctx.viewingPrivateKey
  )

  const leafIndex = BigInt(commitment.treePosition)
  let receivedNote: NewNote | null = null
  let sentNote: NewSentNote | null = null

  if (receiverData) {
    receivedNote = buildReceivedNote(
      commitment.hash, ctx, receiverData, leafIndex,
      'TransactCommitmentV2', annotationData, commitment.treeNumber
    )
  }

  if (senderData) {
    const recipientMPK = decodeRecipientMPK(senderData.encodedMPK, ctx.masterPublicKey, annotationData)
    sentNote = buildSentNote(
      commitment.hash, ctx, senderData, leafIndex,
      'TransactCommitmentV2', recipientMPK, annotationData, commitment.treeNumber
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
  commitment: EncryptedCommitment,
  ctx: TransactContext
): Promise<DecryptResult> {
  const { receiverData, senderData } = await decryptLegacyCommitmentAsReceiverOrSender(
    ctx.chain,
    commitment.ciphertext,
    commitment.ephemeralKeys,
    ctx.viewingPrivateKey,
    ctx.tokenDataGetter
  )

  if (!receiverData && !senderData) {
    return { receivedNote: null, sentNote: null }
  }

  let annotationData: NoteAnnotationData | null = null
  if (commitment.memo.length >= 2 && commitment.memo[0] && commitment.memo[1]) {
    const combined = new Uint8Array(commitment.memo[0].length + commitment.memo[1].length)
    combined.set(commitment.memo[0], 0)
    combined.set(commitment.memo[1], commitment.memo[0].length)
    annotationData = Memo.decryptAnnotationData(combined, ctx.viewingPrivateKey)
  }

  const leafIndex = BigInt(commitment.treePosition)
  let receivedNote: NewNote | null = null
  let sentNote: NewSentNote | null = null

  if (receiverData) {
    receivedNote = buildReceivedNote(
      commitment.hash, ctx, receiverData, leafIndex,
      'LegacyEncryptedCommitment', annotationData, commitment.treeNumber
    )
  }

  if (senderData) {
    // For legacy commitments, encodedMPK is always raw (not XOR-encoded)
    sentNote = buildSentNote(
      commitment.hash, ctx, senderData, leafIndex,
      'LegacyEncryptedCommitment', senderData.encodedMPK, annotationData, commitment.treeNumber
    )
  }

  return { receivedNote, sentNote }
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
    if ('ephemeralKeys' in commitment) {
      return tryDecryptLegacyEncryptedCommitment(commitment as EncryptedCommitment, ctx)
    }
    return tryDecryptTransactCommitment(commitment as TransactCommitment, ctx)
  })

  const results = await Promise.all(decryptionPromises)

  const receivedNotes: NewNote[] = []
  const sentNotes: NewSentNote[] = []
  for (const result of results) {
    if (result.receivedNote) receivedNotes.push(result.receivedNote)
    if (result.sentNote) sentNotes.push(result.sentNote)
  }

  return { receivedNotes, sentNotes }
}

export type { TransactContext, ProcessTransactResult }
