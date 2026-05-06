import type { NoteInput, WalletDB } from '@railgun-reloaded/storage'
import { insertNotesBatch, toDBNotes } from '@railgun-reloaded/storage'

import type { DecryptedNote } from './types'

/**
 * Maps a DecryptedNote to the NoteInput shape required by the storage layer.
 * Drops fields not stored (commitmentType, outputType) and renames treeId and leafIndex.
 * @param note - The decrypted note to convert.
 * @returns A NoteInput object ready for storage.
 */
function toNoteInput (note: DecryptedNote): NoteInput {
  return {
    commitment: note.commitment,
    walletId: note.walletId,
    nullifier: note.nullifier,
    token: note.token.toLowerCase(),
    amount: note.amount,
    blockNumber: note.blockNumber,
    treeNumber: note.treeId,
    treePosition: Number(note.leafIndex),
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
