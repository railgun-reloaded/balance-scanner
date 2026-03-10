import { uint8ArrayToHex } from '@railgun-reloaded/wallet-node'
import type { WalletDB } from '@reloaded/storage/wallet'
import {
  getNoteByNullifier,
  markNoteSpent,
} from '@reloaded/storage/wallet'

type SpentNoteInfo = {
  commitment: string
  nullifier: string
  token: string
  amount: bigint
}

/**
 * Match on-chain nullifiers against wallet notes and mark spent notes.
 * @param nullifiers - On-chain nullifiers from a Transact action
 * @param spentTxid - The transaction ID that spent the notes
 * @param db - The wallet database
 * @returns Array of matched notes that were marked as spent
 */
export function processNullifiers (
  nullifiers: Uint8Array[],
  spentTxid: string,
  db: WalletDB
): SpentNoteInfo[] {
  const spentNotes: SpentNoteInfo[] = []

  console.log(`[TRACE] processNullifiers: ${nullifiers.length} on-chain nullifiers to check`)
  for (const nullifier of nullifiers) {
    const hex = uint8ArrayToHex(nullifier)
    const note = getNoteByNullifier(db, hex)
    console.log(`[TRACE]   on-chain nullifier=${hex} matched=${!!note}`)

    if (!note || note.spent) {
      continue
    }

    markNoteSpent(db, note.commitment, spentTxid)

    spentNotes.push({
      commitment: note.commitment,
      nullifier: hex,
      token: note.token,
      amount: note.amount,
    })
  }

  return spentNotes
}

export type { SpentNoteInfo }
