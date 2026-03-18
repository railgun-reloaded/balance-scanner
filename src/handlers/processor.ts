import type { Shield, Transact, Unshield } from '@railgun-reloaded/scanner'
import type { Chain, TokenDataGetter } from '@railgun-reloaded/wallet-node'
import type { NewNote, NewSentNote, WalletDB } from '@reloaded/storage/wallet'
import { insertNotesBatch, insertSentNotesBatch } from '@reloaded/storage/wallet'

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

type DecryptAndStoreResult = {
  receivedCount: number
  sentCount: number
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
 * Decrypts all actions in a batch and stores successfully decrypted notes to the wallet database.
 * Processes all actions concurrently, then performs a single batch insert for performance.
 * Notes that cannot be decrypted (belonging to other wallets) are silently ignored.
 * @param actions - Array of scanner actions to process
 * @param ctx - Wallet keys and block context
 * @param db - Wallet database to persist decrypted notes
 * @returns Counts of received and sent notes inserted
 */
async function decryptAndStoreActions (
  actions: (Shield | Transact | Unshield)[],
  ctx: ProcessorContext,
  db: WalletDB
): Promise<DecryptAndStoreResult> {
  const results = await Promise.all(actions.map((action) => processAction(action, ctx)))

  const allReceived: NewNote[] = results.flatMap((r) => r.receivedNotes)
  const allSent: NewSentNote[] = results.flatMap((r) => r.sentNotes)

  const receivedCount = insertNotesBatch(db, allReceived)
  const sentCount = insertSentNotesBatch(db, allSent)

  return { receivedCount, sentCount }
}

export { processAction, decryptAndStoreActions }
export type { ProcessorContext, ProcessActionResult, DecryptAndStoreResult }
