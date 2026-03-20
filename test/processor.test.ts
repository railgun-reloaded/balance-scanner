import { ActionType } from '@railgun-reloaded/scanner'
import type { Transact } from '@railgun-reloaded/scanner'
import type { TokenDataGetter } from '@railgun-reloaded/wallet-node'
import { TokenType, initializeCryptographyLibs } from '@railgun-reloaded/wallet-node'
import { hook, test } from 'brittle'

import { decryptActions } from '../src/processor'

hook('setup cryptography libs', async (t) => {
  await initializeCryptographyLibs()
  t.pass('cryptography libraries initialized')
})

/** ERC20 token data getter for tests. */
const mockTokenDataGetter: TokenDataGetter = {
  /**
   * Resolves a token hash to ERC20 token data for testing.
   * @param _txidVersion - Unused TXID version
   * @param _chain - Unused chain
   * @param tokenHash - The token hash to resolve
   * @returns Token data with the extracted address
   */
  async getTokenDataFromHash (_txidVersion, _chain, tokenHash) {
    const cleanHash = tokenHash.startsWith('0x') ? tokenHash.slice(2) : tokenHash
    const addressHex = cleanHash.slice(24)
    const bytes = new Uint8Array(addressHex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(addressHex.slice(i * 2, i * 2 + 2), 16)
    }
    return { tokenType: TokenType.ERC20, tokenAddress: bytes, tokenSubID: new Uint8Array(32) }
  },
}

const mockCtx = {
  chain: { type: 0, id: 1 },
  walletId: 'test-wallet',
  txid: '0x0000',
  viewingPrivateKey: new Uint8Array(32),
  viewingPublicKey: new Uint8Array(32),
  masterPublicKey: new Uint8Array(32),
  nullifyingKey: new Uint8Array(32),
  blockNumber: 100n,
  tokenDataGetter: mockTokenDataGetter,
}

test('decryptActions returns empty arrays for empty action list', async (t) => {
  const result = await decryptActions([], mockCtx)

  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.ok(Array.isArray(result.sentNotes), 'returns sentNotes array')
  t.is(result.receivedNotes.length, 0, 'zero received notes')
  t.is(result.sentNotes.length, 0, 'zero sent notes')
})

test('decryptActions returns empty arrays when commitments are not decryptable', async (t) => {
  const action: Transact = {
    actionType: ActionType.TransactCommitment,
    txID: new Uint8Array(32),
    nullifiers: [],
    commitments: [
      {
        hash: new Uint8Array(32),
        ciphertext: { iv: new Uint8Array(16), tag: new Uint8Array(16), data: [new Uint8Array(32)] },
        blindedSenderViewingKey: new Uint8Array(32),
        blindedReceiverViewingKey: new Uint8Array(32),
        annotationData: new Uint8Array(32),
        memo: [],
        treeNumber: 0,
        treePosition: 0,
      },
    ],
    boundParamsHash: new Uint8Array(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    hasUnshield: false,
  }

  const result = await decryptActions([action], mockCtx)

  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.ok(Array.isArray(result.sentNotes), 'returns sentNotes array')
  t.is(result.receivedNotes.length, 0, 'non-decryptable commitment returns no received notes')
  t.is(result.sentNotes.length, 0, 'non-decryptable commitment returns no sent notes')
})
