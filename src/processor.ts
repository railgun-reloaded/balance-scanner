import type { Shield, Transact, Unshield } from '@railgun-reloaded/scanner'
import type { Chain, TokenDataGetter } from '@railgun-reloaded/wallet-node'

import type { DecryptedNote, DecryptedSentNote } from './types'
import { processShieldAction } from './shield'
import { processTransactAction } from './transact'

type ProcessorContext = {
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

type ProcessActionResult = {
  receivedNotes: DecryptedNote[]
  sentNotes: DecryptedSentNote[]
}

/**
 * Process any action based on its type, attempting decryption and returning
 * any notes that were successfully decrypted as received or sent.
 * @param action - The action to process (Shield, Transact, or Unshield)
 * @param ctx - Wallet keys and block context
 * @returns Received notes and sent notes from successful decryptions
 */
async function processAction (
  action: Shield | Transact | Unshield,
  ctx: ProcessorContext
): Promise<ProcessActionResult> {
  if (action.actionType === 'ShieldCommitment' || action.actionType === 'GeneratedCommitment') {
    const receivedNotes = await processShieldAction(action as Shield, ctx)
    return { receivedNotes, sentNotes: [] }
  }

  if (action.actionType === 'TransactCommitment' || action.actionType === 'EncryptedCommitment') {
    return processTransactAction(action as Transact, ctx)
  }

  return { receivedNotes: [], sentNotes: [] }
}

/**
 * Decrypts all actions in a batch and returns successfully decrypted notes.
 * Processes all actions concurrently. Notes that cannot be decrypted
 * (belonging to other wallets) are silently ignored.
 * @param actions - Array of scanner actions to process
 * @param ctx - Wallet keys and block context
 * @returns Received notes and sent notes from successful decryptions
 */
async function decryptActions (
  actions: (Shield | Transact | Unshield)[],
  ctx: ProcessorContext
): Promise<ProcessActionResult> {
  const results = await Promise.all(actions.map((action) => processAction(action, ctx)))

  const receivedNotes: DecryptedNote[] = results.flatMap((r) => r.receivedNotes)
  const sentNotes: DecryptedSentNote[] = results.flatMap((r) => r.sentNotes)

  return { receivedNotes, sentNotes }
}

export { decryptActions, processAction }
export type { ProcessActionResult, ProcessorContext }
