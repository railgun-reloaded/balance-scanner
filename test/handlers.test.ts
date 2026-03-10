import type { Shield, Transact } from '@railgun-reloaded/scanner'
import { ActionType } from '@railgun-reloaded/scanner'
import type { TokenDataGetter } from '@railgun-reloaded/wallet-node'
import { TokenType, initializeCryptographyLibs } from '@railgun-reloaded/wallet-node'
import { hook, test } from 'brittle'

import { processAction } from '../src/handlers/processor.js'
import { processShieldAction } from '../src/handlers/shield.js'
import { processTransactAction } from '../src/handlers/transact.js'

hook('setup cryptography libs', async (t) => {
  await initializeCryptographyLibs()
  t.pass('cryptography libraries initialized')
})

const mockToken = { id: new Uint8Array(32), tokenType: '0', tokenAddress: new Uint8Array(20), tokenSubID: new Uint8Array(32) }

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

test('processAction routes ShieldCommitment to shield handler', async (t) => {
  const action: Shield = {
    actionType: ActionType.ShieldCommitment,
    batchStartTreePosition: 0,
    commitment: {
      hash: new Uint8Array(32),
      treeNumber: 0,
      treePosition: 0,
      preimage: { npk: new Uint8Array(32), token: mockToken, value: 0n },
      encryptedBundle: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
      shieldKey: new Uint8Array(32),
    },
  }

  const ctx = {
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

  const result = await processAction(action, ctx)
  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.ok(Array.isArray(result.sentNotes), 'returns sentNotes array')
})

test('processAction routes TransactCommitment to transact handler', async (t) => {
  const action: Transact = {
    actionType: ActionType.TransactCommitment,
    txID: new Uint8Array(32),
    nullifiers: [],
    commitments: [],
    boundParamsHash: new Uint8Array(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    hasUnshield: false,
  }

  const ctx = {
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

  const result = await processAction(action, ctx)
  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.is(result.receivedNotes.length, 0, 'empty commitments returns no received notes')
  t.is(result.sentNotes.length, 0, 'empty commitments returns no sent notes')
})

test('processAction returns empty arrays for Unshield', async (t) => {
  const action = {
    actionType: ActionType.Unshield,
  }

  const ctx = {
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

  const result = await processAction(action as any, ctx)
  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.is(result.receivedNotes.length, 0, 'unshield returns no received notes')
  t.is(result.sentNotes.length, 0, 'unshield returns no sent notes')
})

test('processTransactAction returns empty for non-decryptable commitments', async (t) => {
  const action: Transact = {
    actionType: ActionType.TransactCommitment,
    txID: new Uint8Array(32),
    nullifiers: [],
    commitments: [
      {
        hash: new Uint8Array(32),
        ciphertext: {
          iv: new Uint8Array(16),
          tag: new Uint8Array(16),
          data: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
        },
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

  const ctx = {
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

  const result = await processTransactAction(action, ctx)
  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.is(result.receivedNotes.length, 0, 'non-decryptable commitment returns no received notes')
  t.is(result.sentNotes.length, 0, 'non-decryptable commitment returns no sent notes')
})

test('processTransactAction skips commitments without blindedSenderViewingKey', async (t) => {
  const action = {
    actionType: ActionType.TransactCommitment,
    txID: new Uint8Array(32),
    nullifiers: [],
    commitments: [
      {
        hash: new Uint8Array(32),
        ciphertext: {
          iv: new Uint8Array(16),
          tag: new Uint8Array(16),
          data: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
        },
        blindedReceiverViewingKey: new Uint8Array(32),
        annotationData: new Uint8Array(32),
        memo: [] as Uint8Array[],
        treeNumber: 0,
        treePosition: 0,
      },
    ],
    boundParamsHash: new Uint8Array(32),
    utxoBatchStartPositionOut: 0,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    hasUnshield: false,
  } as unknown as Transact

  const ctx = {
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

  const result = await processTransactAction(action, ctx)
  t.ok(Array.isArray(result.receivedNotes), 'returns receivedNotes array')
  t.is(result.receivedNotes.length, 0, 'missing blindedSenderViewingKey returns no received notes')
  t.is(result.sentNotes.length, 0, 'missing blindedSenderViewingKey returns no sent notes')
})

test('processShieldAction returns empty for non-decryptable shield commitment', async (t) => {
  const action: Shield = {
    actionType: ActionType.ShieldCommitment,
    batchStartTreePosition: 0,
    commitment: {
      hash: new Uint8Array(32),
      treeNumber: 0,
      treePosition: 0,
      preimage: { npk: new Uint8Array(32), token: mockToken, value: 0n },
      encryptedBundle: [new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)],
      shieldKey: new Uint8Array(32),
    },
  }

  const ctx = {
    walletId: 'test-wallet',
    viewingPrivateKey: new Uint8Array(32),
    masterPublicKey: new Uint8Array(32),
    nullifyingKey: new Uint8Array(32),
    blockNumber: 100n,
  }

  const notes = await processShieldAction(action, ctx)
  t.ok(Array.isArray(notes), 'returns an array')
  t.is(notes.length, 0, 'non-decryptable shield returns empty')
})

test('processShieldAction returns empty for non-decryptable generated commitment', async (t) => {
  const action: Shield = {
    actionType: ActionType.GeneratedCommitment,
    batchStartTreePosition: 0,
    commitment: {
      hash: new Uint8Array(32),
      treeNumber: 0,
      treePosition: 5,
      preimage: { npk: new Uint8Array(32), token: mockToken, value: 0n },
      encryptedRandom: [new Uint8Array(16), new Uint8Array(16)],
    },
  }

  const ctx = {
    walletId: 'test-wallet',
    viewingPrivateKey: new Uint8Array(32),
    masterPublicKey: new Uint8Array(32),
    nullifyingKey: new Uint8Array(32),
    blockNumber: 100n,
  }

  const notes = await processShieldAction(action, ctx)
  t.ok(Array.isArray(notes), 'returns an array')
  t.is(notes.length, 0, 'non-decryptable generated commitment returns empty')
})
