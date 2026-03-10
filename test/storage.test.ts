import type { NewNote, WalletDB } from '@reloaded/storage/wallet'
import {
  createWallet,
  createWalletDB,
  getAllBalances,
  getNoteByCommitment,
  getTxHistory,
  getUnspentNotes,
  insertNotesBatch,
  insertTxHistoryBatch,
  recalculateAllBalances,
} from '@reloaded/storage/wallet'
import { test } from 'brittle'

const WALLET_ID = 'test-wallet-001'
const TOKEN_A = '0x0000000000000000000000000000000000000001'
const TOKEN_B = '0x0000000000000000000000000000000000000002'

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
    CREATE TABLE IF NOT EXISTS tx_history (
      id TEXT PRIMARY KEY NOT NULL,
      wallet_id TEXT NOT NULL,
      type TEXT NOT NULL,
      txid TEXT NOT NULL,
      block_number TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS tx_history_wallet_block_idx ON tx_history(wallet_id, block_number);
    CREATE INDEX IF NOT EXISTS tx_history_txid_idx ON tx_history(txid);
  `)

  return db
}

/**
 * Creates a test note with the given index for unique fields.
 * @param index - Unique index for generating distinct field values
 * @param overrides - Optional field overrides
 * @returns A NewNote instance
 */
function makeNote (index: number, overrides?: Partial<NewNote>): NewNote {
  return {
    commitment: `0x${index.toString(16).padStart(64, '0')}`,
    walletId: WALLET_ID,
    nullifier: `0xn${index.toString(16).padStart(63, '0')}`,
    token: TOKEN_A,
    amount: 1000000000000000000n,
    blockNumber: 1000n + BigInt(index),
    treeId: 0,
    leafIndex: BigInt(index),
    ...overrides,
  }
}

// --- Batch insert ---

test('insertNotesBatch stores notes correctly', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const note1 = makeNote(1)
  const notes = [note1, makeNote(2), makeNote(3)]
  const count = insertNotesBatch(db, notes)

  t.is(count, 3, 'inserted 3 notes')

  const retrieved = getNoteByCommitment(db, note1.commitment)
  t.ok(retrieved, 'note is retrievable by commitment')
  t.is(retrieved!.token, TOKEN_A, 'token matches')
  t.is(retrieved!.walletId, WALLET_ID, 'walletId matches')
})

test('insertNotesBatch is idempotent', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const note = makeNote(10)
  insertNotesBatch(db, [note])
  const count = insertNotesBatch(db, [note])

  t.is(count, 0, 'duplicate insert returns 0 (conflict ignored)')

  const all = getUnspentNotes(db, WALLET_ID)
  t.is(all.length, 1, 'only one note stored')
})

// --- Batch performance ---

test('insertNotesBatch handles 100+ notes', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const notes = Array.from({ length: 150 }, (_, i) => makeNote(i + 100))
  const count = insertNotesBatch(db, notes)

  t.is(count, 150, 'inserted 150 notes in batch')

  const all = getUnspentNotes(db, WALLET_ID)
  t.is(all.length, 150, 'all 150 notes are unspent')
})

// --- Balance calculation ---

test('recalculateAllBalances computes correct balances', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const notes = [
    makeNote(1, { token: TOKEN_A, amount: 100n }),
    makeNote(2, { token: TOKEN_A, amount: 200n }),
    makeNote(3, { token: TOKEN_B, amount: 500n }),
  ]
  insertNotesBatch(db, notes)

  recalculateAllBalances(db, WALLET_ID)

  const balances = getAllBalances(db, WALLET_ID)
  t.is(balances.length, 2, 'two token balances')

  const balanceA = balances.find((b) => b.token === TOKEN_A)
  const balanceB = balances.find((b) => b.token === TOKEN_B)

  t.ok(balanceA, 'token A balance exists')
  t.is(balanceA!.amount, 300n, 'token A balance is 100 + 200 = 300')
  t.ok(balanceB, 'token B balance exists')
  t.is(balanceB!.amount, 500n, 'token B balance is 500')
})

// --- Empty batch ---

test('insertNotesBatch with empty array returns 0', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const count = insertNotesBatch(db, [])
  t.is(count, 0, 'empty batch returns 0')
})

// --- Transaction history ---

test('insertTxHistoryBatch records unshield transactions', (t) => {
  const db = createTestDB()
  createWallet(db, { id: WALLET_ID, encryptedKeys: Buffer.from('keys'), name: 'test' })

  const count = insertTxHistoryBatch(db, [
    {
      id: '0xtxhash:unshield',
      walletId: WALLET_ID,
      type: 'unshield',
      txid: '0xtxhash',
      blockNumber: 5000n,
      timestamp: new Date(1700000000000),
      metadata: {
        to: '0x0000000000000000000000000000000000001234',
        token: '0x0000000000000000000000000000000000000001',
        amount: '1000000',
      },
    },
  ])

  t.is(count, 1, 'inserted 1 tx history entry')

  const history = getTxHistory(db, WALLET_ID)
  t.is(history.length, 1, 'one history entry')
  const entry = history[0]!
  t.is(entry.type, 'unshield', 'type is unshield')
  t.is(entry.txid, '0xtxhash', 'txid matches')
})
