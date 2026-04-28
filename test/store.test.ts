import crypto from 'crypto'

import { bytesToHex } from '@railgun-reloaded/bytes'
import type { WalletDB } from '@railgun-reloaded/storage'
import {
  createWallet,
  createWalletDB,
  getAllNotes,
} from '@railgun-reloaded/storage'
import { test } from 'brittle'

import { storeDecryptedNotes } from '../src/store.js'
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
function createTestWalletDb (): WalletDB {
  return createWalletDB({ path: ':memory:', enableWAL: false, runMigrations: true })
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
    nullifier: bytesToHex(randomBytes(32), { prefix: true }),
    token: '0x0000000000000000000000000000000000000000',
    amount: 1000n,
    blockNumber: 100n,
    treeId: 0,
    leafIndex: 0n,
    commitmentType: 'TransactCommitment',
    outputType: null,
    ...overrides,
  }
}

test('storeDecryptedNotes persists notes to wallet DB', (t) => {
  const db = createTestWalletDb()
  createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const notes = [makeNote(), makeNote()]
  const count = storeDecryptedNotes(db, notes)

  t.is(count, 2, 'returns number of rows inserted')

  const stored = getAllNotes(db, 'test-wallet')
  t.is(stored.length, 2, 'two notes persisted in DB')
})

test('storeDecryptedNotes returns 0 for empty array', (t) => {
  const db = createTestWalletDb()
  createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const count = storeDecryptedNotes(db, [])

  t.is(count, 0, 'returns 0 when no notes provided')
})

test('storeDecryptedNotes handles duplicate notes idempotently', (t) => {
  const db = createTestWalletDb()
  createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const note = makeNote()
  storeDecryptedNotes(db, [note])
  const secondCount = storeDecryptedNotes(db, [note])

  t.is(secondCount, 0, 'second insert of duplicate returns 0')

  const stored = getAllNotes(db, 'test-wallet')
  t.is(stored.length, 1, 'only one note in DB after duplicate insert')
})

test('storeDecryptedNotes correctly maps treeId to treeNumber and leafIndex to treePosition', (t) => {
  const db = createTestWalletDb()
  createWallet(db, { id: 'test-wallet', encryptedKeys: Buffer.from('keys') })

  const note = makeNote({ treeId: 3, leafIndex: 42n })
  storeDecryptedNotes(db, [note])

  const stored = getAllNotes(db, 'test-wallet')
  t.is(stored.length, 1, 'one note stored')
  t.is(stored[0]!.treeNumber, 3, 'treeId mapped to treeNumber')
  t.is(stored[0]!.treePosition, 42, 'leafIndex mapped to treePosition')
})
