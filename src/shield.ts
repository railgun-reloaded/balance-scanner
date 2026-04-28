import { bytesToHex } from '@railgun-reloaded/bytes'
import type { Shield } from '@railgun-reloaded/scanner'
import { ShieldNote } from '@railgun-reloaded/wallet-node'

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

  let shieldNote: ShieldNote | null

  if ('encryptedRandom' in commitment) {
    shieldNote = ShieldNote.fromGeneratedCommitment(commitment, ctx.viewingPrivateKey, ctx.masterPublicKey)
  } else {
    shieldNote = await ShieldNote.fromShieldCommitment(commitment, ctx.viewingPrivateKey, ctx.masterPublicKey)
  }

  if (!shieldNote) {
    return []
  }

  const leafIndex = BigInt(commitment.treePosition)
  const nullifier = computeNullifier(ctx.nullifyingKey, leafIndex)
  const commitmentType = 'encryptedRandom' in commitment ? 'GeneratedCommitment' : 'ShieldCommitment'

  return [{
    commitment: bytesToHex(commitment.hash, { prefix: true }),
    walletId: ctx.walletId,
    nullifier: bytesToHex(nullifier, { prefix: true }),
    token: bytesToHex(shieldNote.tokenData.tokenAddress, { prefix: true }),
    amount: shieldNote.value,
    blockNumber: ctx.blockNumber,
    treeId: commitment.treeNumber,
    leafIndex,
    commitmentType,
    outputType: null,
  }]
}

export type { ShieldContext }
