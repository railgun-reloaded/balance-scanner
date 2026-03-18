import type { Note, WalletDB } from '@reloaded/storage/wallet'
import {
  WalletBalanceBucket,
  getBalanceBucket,
  getNoteByCommitment,
  getUnspentNotes,
  getUnspentNotesByToken,
} from '@reloaded/storage/wallet'

/**
 * Returns all token balances for a wallet, filtered by balance bucket.
 *
 * Iterates unspent notes and sums amounts per token hash for notes whose
 * balance bucket is included in `balanceBucketFilter`. By default all
 * buckets are considered so the result reflects total visible balance,
 * not just spendable balance.
 * @param walletId - Wallet identifier (hex-encoded master public key)
 * @param db - Wallet database instance
 * @param balanceBucketFilter - Balance buckets to include in the sum. Defaults to all buckets.
 * @param activePOIListKeys - Active POI list keys used to determine each note's bucket.
 * @returns A map of token hash to total balance as bigint.
 */
function getBalances (
  walletId: string,
  db: WalletDB,
  balanceBucketFilter: WalletBalanceBucket[] = Object.values(WalletBalanceBucket),
  activePOIListKeys: string[] = []
): Record<string, bigint> {
  const unspentNotes = getUnspentNotes(db, walletId)
  const result: Record<string, bigint> = {}

  for (const note of unspentNotes) {
    const bucket = getBalanceBucket(note, activePOIListKeys)
    if (!balanceBucketFilter.includes(bucket)) continue
    result[note.token] = (result[note.token] ?? 0n) + note.amount
  }

  return result
}

/**
 * Returns the balance of a specific token for a wallet, filtered by balance bucket.
 *
 * Only unspent notes matching the given token hash and whose balance bucket is
 * included in `balanceBucketFilter` are summed. Returns 0n when no qualifying
 * notes exist.
 * @param walletId - Wallet identifier (hex-encoded master public key)
 * @param token - Token hash as a hex string (as stored in the notes table)
 * @param db - Wallet database instance
 * @param balanceBucketFilter - Balance buckets to include in the sum. Defaults to all buckets.
 * @param activePOIListKeys - Active POI list keys used to determine each note's bucket.
 * @returns Total balance as bigint for the given token.
 */
function getBalanceByToken (
  walletId: string,
  token: string,
  db: WalletDB,
  balanceBucketFilter: WalletBalanceBucket[] = Object.values(WalletBalanceBucket),
  activePOIListKeys: string[] = []
): bigint {
  const unspentNotes = getUnspentNotesByToken(db, walletId, token)
  let total = 0n

  for (const note of unspentNotes) {
    const bucket = getBalanceBucket(note, activePOIListKeys)
    if (!balanceBucketFilter.includes(bucket)) continue
    total += note.amount
  }

  return total
}

/**
 * Returns all spendable UTXOs for a wallet, optionally filtered to a single token.
 *
 * Only notes in the {@link WalletBalanceBucket.Spendable} bucket are returned.
 * The bucket determination respects `activePOIListKeys`: when no POI lists are
 * active (empty array) every unspent note is considered spendable.
 * @param walletId - Wallet identifier (hex-encoded master public key)
 * @param db - Wallet database instance
 * @param token - Optional token hash to restrict results to a single token.
 * @param activePOIListKeys - Active POI list keys used to determine each note's bucket.
 * @returns Array of notes that are in the Spendable bucket.
 */
function getSpendableUTXOs (
  walletId: string,
  db: WalletDB,
  token?: string,
  activePOIListKeys: string[] = []
): Note[] {
  const unspentNotes = token
    ? getUnspentNotesByToken(db, walletId, token)
    : getUnspentNotes(db, walletId)

  return unspentNotes.filter(
    (note) => getBalanceBucket(note, activePOIListKeys) === WalletBalanceBucket.Spendable
  )
}

/**
 * Returns the {@link WalletBalanceBucket} state of a UTXO identified by its commitment.
 *
 * The bucket captures the full lifecycle state of the note: Spendable, ShieldPending,
 * ShieldBlocked, MissingInternalPOI, MissingExternalPOI, ProofSubmitted, or Spent.
 * @param commitment - The note commitment hash as a hex string.
 * @param db - Wallet database instance
 * @param activePOIListKeys - Active POI list keys used to determine the note's bucket.
 * @returns The WalletBalanceBucket for the commitment, or null if not found.
 */
function getUTXOState (
  commitment: string,
  db: WalletDB,
  activePOIListKeys: string[] = []
): WalletBalanceBucket | null {
  const note = getNoteByCommitment(db, commitment)
  if (!note) return null
  return getBalanceBucket(note, activePOIListKeys)
}

export { getBalances, getBalanceByToken, getSpendableUTXOs, getUTXOState }
