import type { Shield, Transact, Unshield } from '@railgun-reloaded/scanner'
import type { Chain, TokenDataGetter } from '@railgun-reloaded/wallet-node'
import type { NewNote, NewSentNote } from '@reloaded/storage/wallet'

import { processShieldAction } from './shield.js'
import { processTransactAction } from './transact.js'

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
  receivedNotes: NewNote[]
  sentNotes: NewSentNote[]
}

/**
 * Process any action based on its type, attempting decryption and returning
 * any notes that were successfully decrypted as received or sent.
 * @param action - The action to process (Shield, Transact, or Unshield)
 * @param ctx - Wallet keys and block context
 * @returns Received notes and sent notes from successful decryptions
 */
export async function processAction (
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

export type { ProcessorContext, ProcessActionResult }
