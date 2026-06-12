import crypto from 'crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { WalletDB } from '@railgun-reloaded/storage'
import {
  createWallet,
  createWalletDB,
  getAllNotes,
} from '@railgun-reloaded/storage'

import { storeDecryptedNotes, toNoteInput } from '../src/store.js'
import type { DecryptedNote } from '../src/types.js'

/**
 * Generate random bytes of the given length.
 * @param size - Number of random bytes to produce.
 * @returns Random Uint8Array.
 */
function randomBytes (size: number): Uint8Array {
  return Uint8Array.from(crypto.randomBytes(size))
}

/**
 * Create an in-memory wallet database for testing.
 * @returns WalletDB instance with schema applied.
 */
async function createTestWalletDb (): Promise<WalletDB> {
  return createWalletDB({ path: ':memory:', runMigrations: true })
}

/**
 * Build a minimal DecryptedNote for testing.
 * @param overrides - Fields to override on the default note.
 * @returns Fully-populated DecryptedNote.
 */
function makeNote (overrides: Partial<DecryptedNote> = {}): DecryptedNote {
  return {
    commitment: bytesToHex(randomBytes(32), { prefix: true }),
    walletId: 'test-wallet',
    chainId: 1,
    nullifier: bytesToHex(randomBytes(32), { prefix: true }),
    token: '0x0000000000000000000000000000000000000000',
    amount: 1000n,
    tokenType: 0,
    tokenSubID: `0x${'00'.repeat(32)}`,
    blockNumber: 100n,
    treeId: 0,
    leafIndex: 0n,
    commitmentType: 'TransactCommitment',
    outputType: null,
    ...overrides,
  }
}

test('storeDecryptedNotes persists notes to wallet DB', async () => {
  const db = await createTestWalletDb()
  await createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const notes = [makeNote(), makeNote()]
  const count = await storeDecryptedNotes(db, notes)

  assert.equal(count, 2, 'returns number of rows inserted')

  const stored = await getAllNotes(db, 'test-wallet', 1)
  assert.equal(stored.length, 2, 'two notes persisted in DB')
})

test('storeDecryptedNotes returns 0 for empty array', async () => {
  const db = await createTestWalletDb()
  await createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const count = await storeDecryptedNotes(db, [])

  assert.equal(count, 0, 'returns 0 when no notes provided')
})

test('storeDecryptedNotes handles duplicate notes idempotently', async () => {
  const db = await createTestWalletDb()
  await createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const note = makeNote()
  await storeDecryptedNotes(db, [note])
  const secondCount = await storeDecryptedNotes(db, [note])

  assert.equal(secondCount, 0, 'second insert of duplicate returns 0')

  const stored = await getAllNotes(db, 'test-wallet', 1)
  assert.equal(stored.length, 1, 'only one note in DB after duplicate insert')
})

test('storeDecryptedNotes correctly maps treeId to treeNumber and leafIndex to treePosition', async () => {
  const db = await createTestWalletDb()
  await createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const note = makeNote({ treeId: 3, leafIndex: 42n })
  await storeDecryptedNotes(db, [note])

  const stored = await getAllNotes(db, 'test-wallet', 1)
  assert.equal(stored.length, 1, 'one note stored')
  assert.equal(stored[0]!.treeNumber, 3, 'treeId mapped to treeNumber')
  assert.equal(stored[0]!.treePosition, 42, 'leafIndex mapped to treePosition')
})

test('toNoteInput lowercases the token address regardless of input case', () => {
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  assert.equal(toNoteInput(makeNote({ token: checksumAddress })).token, checksumAddress.toLowerCase())
  assert.equal(toNoteInput(makeNote({ token: checksumAddress.toUpperCase() })).token, checksumAddress.toLowerCase())
  assert.equal(toNoteInput(makeNote({ token: checksumAddress.toLowerCase() })).token, checksumAddress.toLowerCase())
})

test('toNoteInput forwards tokenType and tokenSubID unchanged', () => {
  const subIdHex = `0x${'ab'.repeat(32)}`
  const input = toNoteInput(makeNote({ tokenType: 1, tokenSubID: subIdHex }))

  assert.equal(input.tokenType, 1)
  assert.equal(input.tokenSubID, subIdHex)
})

test('storeDecryptedNotes persists ERC721 tokenType and tokenSubID end-to-end', async () => {
  const db = await createTestWalletDb()
  await createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const subIdHex = `0x${'ab'.repeat(32)}`
  await storeDecryptedNotes(db, [makeNote({ tokenType: 1, tokenSubID: subIdHex })])

  const stored = await getAllNotes(db, 'test-wallet', 1)
  assert.equal(stored.length, 1)
  assert.equal(stored[0]!.tokenType, 1)
  assert.equal(stored[0]!.tokenSubID.length, 32)
  assert.ok(stored[0]!.tokenSubID.every((byte) => byte === 0xab))
})
