import { bigIntToBytes, bytesToHex } from '@railgun-reloaded/bytes'
import { poseidon } from '@railgun-reloaded/wallet-node'

import type { SpentNoteInfo } from './types'

/**
 * Compute a nullifier from nullifying key and leaf index.
 * Formula: poseidon(nullifyingKey, leafIndex)
 * @param nullifyingKey - The wallet's nullifying key
 * @param leafIndex - The leaf index in the merkle tree
 * @returns The nullifier as a Uint8Array
 */
function computeNullifier (nullifyingKey: Uint8Array, leafIndex: bigint): Uint8Array {
  // poseidon expects Uint8Array inputs, leafIndex needs to be converted
  const leafIndexBytes = bigIntToBytes(leafIndex, 32)
  return poseidon([nullifyingKey, leafIndexBytes])
}

/**
 * Match on-chain nullifiers against a set of known wallet notes.
 * Does not perform any storage reads or writes — persistence is the caller's responsibility.
 * @param nullifiers - On-chain nullifiers from a Transact action
 * @param notes - Known wallet notes to match against
 * @returns Notes matched by the provided nullifiers
 */
function processNullifiers (
  nullifiers: Uint8Array[],
  notes: SpentNoteInfo[]
): SpentNoteInfo[] {
  const nullifierSet = new Set(nullifiers.map((n) => bytesToHex(n, { prefix: true })))
  return notes.filter((note) => nullifierSet.has(note.nullifier))
}

export { processNullifiers, computeNullifier }
export type { SpentNoteInfo }
