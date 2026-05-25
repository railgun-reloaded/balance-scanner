import { hexToBytes } from '@railgun-reloaded/bytes'
import type { NoteInput, WalletDB } from '@railgun-reloaded/storage'
import { insertNotesBatch, toDBNotes } from '@railgun-reloaded/storage'

import type { DecryptedNote } from './types'

/**
 * Canonical form for ERC-20 token addresses crossing into the storage layer.
 * Lowercased so storage's case-insensitive lookups never miss rows written
 * through this boundary, regardless of how the upstream cased the address.
 * @param token - Token address in any case.
 * @returns Lowercase token address.
 */
function normalizeToken (token: string): string {
  return token.toLowerCase()
}

/**
 * Maps a DecryptedNote to the NoteInput shape required by the storage layer.
 * Drops fields not stored (commitmentType, outputType) and renames treeId and leafIndex.
 * @param note - The decrypted note to convert.
 * @returns A NoteInput object ready for storage.
 */
const COMMITMENT_TYPE_BY_LABEL: Record<string, number> = {
  GeneratedCommitment: 0,
  ShieldCommitment: 0,
  TransactCommitment: 1,
}

function commitmentTypeToNumber (label: string): number {
  return COMMITMENT_TYPE_BY_LABEL[label] ?? 1
}

function toNoteInput (note: DecryptedNote): NoteInput {
  return {
    commitment: note.commitment,
    walletId: note.walletId,
    chainId: note.chainId ?? 0,
    nullifier: note.nullifier,
    token: normalizeToken(note.token),
    amount: note.amount,
    tokenType: note.tokenType,
    tokenSubID: note.tokenSubID,
    blockNumber: note.blockNumber,
    treeNumber: note.treeId,
    treePosition: Number(note.leafIndex),
    commitmentType: commitmentTypeToNumber(note.commitmentType),
    ...(note.outputType !== null && { outputType: note.outputType }),
    ...(note.npk !== undefined && { npk: hexToBytes(note.npk) }),
    ...(note.random !== undefined && { random: hexToBytes(note.random) }),
    ...(note.creationTxid !== undefined && { creationTxid: note.creationTxid }),
    ...(note.creationRailgunTxid !== undefined && { creationRailgunTxid: note.creationRailgunTxid }),
  }
}

/**
 * Persists an array of DecryptedNote records to the wallet database in a single batch.
 * Returns 0 immediately when the input array is empty.
 * @param walletDb - Wallet database instance to write into.
 * @param notes - Array of decrypted notes to persist.
 * @returns Number of rows inserted (duplicates are silently ignored).
 */
function storeDecryptedNotes (walletDb: WalletDB, notes: DecryptedNote[]): number {
  if (notes.length === 0) return 0
  const noteInputs = notes.map(toNoteInput)
  const dbNotes = toDBNotes(noteInputs)
  return insertNotesBatch(walletDb, dbNotes)
}

export { storeDecryptedNotes, toNoteInput }
