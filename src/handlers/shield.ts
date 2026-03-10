import type { Shield } from '@railgun-reloaded/scanner'
import {
  Note,
  ShieldNote,
  uint8ArrayToHex,
} from '@railgun-reloaded/wallet-node'
import type { NewNote } from '@reloaded/storage/wallet'

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
): Promise<NewNote[]> {
  const commitment = action.commitment

  let shieldNote: ShieldNote | null

  if ('encryptedRandom' in commitment) {
    // GeneratedCommitment (V1) — random is encrypted with viewing private key
    shieldNote = ShieldNote.fromGeneratedCommitment(commitment, ctx.viewingPrivateKey, ctx.masterPublicKey)
  } else {
    // ShieldCommitment (V2+) — encrypted bundle needs ECDH decryption
    shieldNote = await ShieldNote.fromShieldCommitment(commitment, ctx.viewingPrivateKey, ctx.masterPublicKey)
  }

  if (!shieldNote) {
    return []
  }

  const leafIndex = BigInt(commitment.treePosition)
  const nullifier = Note.computeNullifier(ctx.nullifyingKey, leafIndex)

  const commitmentType = 'encryptedRandom' in commitment ? 'GeneratedCommitment' : 'ShieldCommitment'
  console.log(`[DEBUG] SHIELD note: block=${ctx.blockNumber} value=${shieldNote.value} leaf=${leafIndex} token=${uint8ArrayToHex(shieldNote.tokenData.tokenAddress)}`)
  return [{
    commitment: uint8ArrayToHex(commitment.hash),
    walletId: ctx.walletId,
    nullifier: uint8ArrayToHex(nullifier),
    token: uint8ArrayToHex(shieldNote.tokenData.tokenAddress),
    amount: shieldNote.value,
    blockNumber: ctx.blockNumber,
    treeId: commitment.treeNumber,
    leafIndex,
    commitmentType,
  }]
}

export type { ShieldContext }
