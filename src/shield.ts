import type { Shield } from '@railgun-reloaded/scanner'
import {
  ShieldNote,
  uint8ArrayToHex,
  uint8ArrayToBigInt,
} from '@railgun-reloaded/wallet-node'

import { computeNullifier } from './nullifier'
import type { DecryptedNote } from './types'

type ShieldContext = {
  walletId: string
  viewingPrivateKey: Uint8Array
  masterPublicKey: Uint8Array
  nullifyingKey: Uint8Array
  blockNumber: bigint
}

/**
 * Process a Shield action, attempting decryption of the commitment.
 * @param action - The Shield action containing the commitment
 * @param ctx - Wallet keys and block context
 * @returns An array with a single note if decryption succeeds, empty array otherwise
 */
export async function processShieldAction (
  action: Shield,
  ctx: ShieldContext
): Promise<DecryptedNote[]> {
  const commitment = action.commitment
  const masterPublicKeyBigInt = uint8ArrayToBigInt(ctx.masterPublicKey)

  let shieldNote: ShieldNote | null

  if ('encryptedRandom' in commitment) {
    shieldNote = ShieldNote.fromGeneratedCommitment(commitment, masterPublicKeyBigInt)
  } else {
    shieldNote = await ShieldNote.fromShieldCommitment(commitment, ctx.viewingPrivateKey, masterPublicKeyBigInt)
  }

  if (!shieldNote) {
    return []
  }

  const leafIndex = BigInt(commitment.treePosition)
  const nullifier = computeNullifier(ctx.nullifyingKey, leafIndex)
  const commitmentType = 'encryptedRandom' in commitment ? 'GeneratedCommitment' : 'ShieldCommitment'

  return [{
    commitment: uint8ArrayToHex(commitment.hash),
    walletId: ctx.walletId,
    nullifier: uint8ArrayToHex(nullifier),
    token: shieldNote.tokenData.tokenAddress,
    amount: shieldNote.value,
    blockNumber: ctx.blockNumber,
    treeId: commitment.treeNumber,
    leafIndex,
    commitmentType,
    outputType: null,
  }]
}

export type { ShieldContext }
