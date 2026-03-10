import { hexToUint8Array } from '@railgun-reloaded/wallet-node'
import type { NewNote, WalletDB } from '@reloaded/storage/wallet'
import {
  createWallet,
  createWalletDB,
  getAllBalances,
  getNoteByCommitment,
  getUnspentNotes,
  insertNotesBatch,
  recalculateAllBalances,
} from '@reloaded/storage/wallet'
import { test } from 'brittle'

import { processNullifiers } from '../src/handlers/nullifier.js'

const WALLET_ID = 'test-wallet-nullifier'
const TOKEN = '0x0000000000000000000000000000000000000001'

/**
 * Creates an in-memory wallet DB with schema tables initialized.
 * @returns An in-memory WalletDB instance
 */
function createTestDB (): WalletDB {
  const db = createWalletDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: false,
  })

  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY NOT NULL,
      encrypted_keys BLOB NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS notes (
      commitment TEXT PRIMARY KEY NOT NULL,
      wallet_id TEXT NOT NULL,
      nullifier TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      spent INTEGER NOT NULL DEFAULT 0,
      spent_txid TEXT,
      block_number TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      leaf_index TEXT NOT NULL,
      commitment_type TEXT NOT NULL DEFAULT 'TransactCommitmentV2',
      output_type INTEGER,
      pois_per_list TEXT,
      decrypted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS notes_wallet_spent_idx ON notes(wallet_id, spent);
    CREATE INDEX IF NOT EXISTS notes_wallet_token_idx ON notes(wallet_id, token);
    CREATE INDEX IF NOT EXISTS notes_nullifier_idx ON notes(nullifier);
    CREATE TABLE IF NOT EXISTS balances (
      wallet_id TEXT NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (wallet_id, token),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
  `)

  return db
}

/**
 * Creates a test note with a specific nullifier.
 * @param index - Unique index for generating distinct field values
 * @param nullifier - The nullifier hex string for this note
 * @returns A NewNote instance
 */
function makeNote (index: number, nullifier: string): NewNote {
  return {
    commitment: `0x${index.toString(16).padStart(64, '0')}`,
    walletId: WALLET_ID,
    nullifier,
    token: TOKEN,
    amount: 1000n * BigInt(index),
    blockNumber: 1000n + BigInt(index),
    treeId: 0,
    leafIndex: BigInt(index),
  }
}

test('processNullifiers matches wallet notes and marks spent', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const nullifier1 = '0x' + 'aa'.repeat(32)
  const nullifier2 = '0x' + 'bb'.repeat(32)
  insertNotesBatch(db, [makeNote(1, nullifier1), makeNote(2, nullifier2)])

  const spentNotes = processNullifiers(
    [hexToUint8Array(nullifier1.slice(2))],
    '0xtxid1',
    db
  )

  t.is(spentNotes.length, 1, 'one note matched')
  const matched = spentNotes[0]!
  t.is(matched.nullifier, nullifier1, 'correct nullifier matched')

  const note = getNoteByCommitment(db, makeNote(1, nullifier1).commitment)
  t.ok(note, 'note still exists')
  t.ok(note!.spent, 'note is marked spent')
  t.is(note!.spentTxid, '0xtxid1', 'spentTxid recorded')

  const unspent = getUnspentNotes(db, WALLET_ID)
  t.is(unspent.length, 1, 'only one note remains unspent')
})

test('processNullifiers ignores non-matching nullifiers', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const nullifier = '0x' + 'cc'.repeat(32)
  insertNotesBatch(db, [makeNote(10, nullifier)])

  const randomNullifier = hexToUint8Array('dd'.repeat(32))
  const spentNotes = processNullifiers([randomNullifier], '0xtxid2', db)

  t.is(spentNotes.length, 0, 'no notes matched')

  const unspent = getUnspentNotes(db, WALLET_ID)
  t.is(unspent.length, 1, 'note remains unspent')
})

test('processNullifiers is idempotent', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const nullifier = '0x' + 'ee'.repeat(32)
  insertNotesBatch(db, [makeNote(20, nullifier)])

  const nullifierBytes = hexToUint8Array(nullifier.slice(2))

  const first = processNullifiers([nullifierBytes], '0xtxid3', db)
  t.is(first.length, 1, 'first call matches')

  const second = processNullifiers([nullifierBytes], '0xtxid3', db)
  t.is(second.length, 0, 'second call skips already-spent note')
})

test('balance reflects spent notes after processNullifiers', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const nullifier1 = '0x' + '11'.repeat(32)
  const nullifier2 = '0x' + '22'.repeat(32)
  const nullifier3 = '0x' + '33'.repeat(32)

  insertNotesBatch(db, [
    makeNote(1, nullifier1),
    makeNote(2, nullifier2),
    makeNote(3, nullifier3),
  ])

  // Spend note 1 (amount: 1000) and note 2 (amount: 2000)
  processNullifiers(
    [hexToUint8Array(nullifier1.slice(2)), hexToUint8Array(nullifier2.slice(2))],
    '0xtxid-spend',
    db
  )

  recalculateAllBalances(db, WALLET_ID)

  const balances = getAllBalances(db, WALLET_ID)
  t.is(balances.length, 1, 'one token balance')
  t.is(balances[0]!.amount, 3000n, 'balance is only note 3 (3 * 1000 = 3000)')
})
