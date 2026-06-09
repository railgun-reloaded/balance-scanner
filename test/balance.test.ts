import assert from 'node:assert/strict'
import { test } from 'node:test'

import { aggregateBalances, getBalances, getTokenBalance, getTokenBalances } from '../src/balance'
import type { DecryptedNote } from '../src/types'
import { TokenType } from '../src/types'

const ERC20_SUB_ID = `0x${'00'.repeat(32)}`
const NFT_COLLECTION = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'

/**
 * Build a `DecryptedNote` test fixture with sane defaults, allowing
 * individual fields to be overridden per test case.
 * @param overrides - Fields to replace on the default note.
 * @returns A fully-populated `DecryptedNote`.
 */
const createNote = (overrides: Partial<DecryptedNote>): DecryptedNote => ({
  commitment: '0x0000000000000000000000000000000000000000000000000000000000000000',
  walletId: 'test-wallet',
  chainId: 1,
  nullifier: '0x1111111111111111111111111111111111111111111111111111111111111111',
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  amount: 1000n,
  tokenType: TokenType.ERC20,
  tokenSubID: ERC20_SUB_ID,
  blockNumber: 100n,
  treeId: 0,
  leafIndex: 0n,
  commitmentType: 'standard',
  outputType: null,
  ...overrides,
})

/**
 * Build a `DecryptedNote` ERC721 fixture. ERC721 notes always have an amount
 * of `1` per the RAILGUN protocol invariant.
 * @param tokenSubID - 0x-prefixed token ID, 32-byte hex.
 * @param overrides - Additional field overrides.
 * @returns An ERC721 `DecryptedNote`.
 */
const createNFTNote = (
  tokenSubID: string,
  overrides: Partial<DecryptedNote> = {}
): DecryptedNote => createNote({
  token: NFT_COLLECTION,
  amount: 1n,
  tokenType: TokenType.ERC721,
  tokenSubID,
  ...overrides,
})

test('empty notes array returns empty array', () => {
  const result = aggregateBalances([], new Set())

  assert.ok(Array.isArray(result), 'returns array')
  assert.equal(result.length, 0, 'empty result')
})

test('single token all unspent', () => {
  const notes = [
    createNote({ nullifier: '0x01', amount: 100n }),
    createNote({ nullifier: '0x02', amount: 200n }),
    createNote({ nullifier: '0x03', amount: 300n }),
  ]

  const result = aggregateBalances(notes, new Set())

  assert.equal(result.length, 1, 'one token balance')
  const balance = result[0]
  if (balance) {
    assert.equal(balance.token, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'correct token')
    assert.equal(balance.balance, 600n, 'correct balance sum')
    assert.equal(balance.utxos.length, 3, 'correct utxo count')
    assert.deepEqual(balance.utxos, notes, 'utxos array contains all notes')
  }
})

test('single token some spent', () => {
  const notes = [
    createNote({ nullifier: '0x01', amount: 100n }),
    createNote({ nullifier: '0x02', amount: 200n }),
    createNote({ nullifier: '0x03', amount: 300n }),
    createNote({ nullifier: '0x04', amount: 400n }),
  ]

  const spentNullifiers = new Set(['0x02', '0x04'])
  const result = aggregateBalances(notes, spentNullifiers)

  assert.equal(result.length, 1, 'one token balance')
  const balance = result[0]
  if (balance) {
    assert.equal(balance.balance, 400n, 'correct balance sum (100 + 300)')
    assert.equal(balance.utxos.length, 2, 'correct utxo count')
    assert.equal(balance.utxos[0]?.nullifier, '0x01', 'first unspent note included')
    assert.equal(balance.utxos[1]?.nullifier, '0x03', 'second unspent note included')
  }
})

test('multiple tokens mixed', () => {
  const tokenA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const tokenB = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  const tokenC = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createNote({ token: tokenA, nullifier: '0x01', amount: 100n }),
    createNote({ token: tokenB, nullifier: '0x02', amount: 200n }),
    createNote({ token: tokenA, nullifier: '0x03', amount: 300n }),
    createNote({ token: tokenC, nullifier: '0x04', amount: 400n }),
    createNote({ token: tokenB, nullifier: '0x05', amount: 500n }),
  ]

  const spentNullifiers = new Set(['0x02'])
  const result = aggregateBalances(notes, spentNullifiers)

  assert.equal(result.length, 3, 'three token balances')

  const balanceA = result.find(b => b.token === tokenA)
  const balanceB = result.find(b => b.token === tokenB)
  const balanceC = result.find(b => b.token === tokenC)

  assert.ok(balanceA, 'token A present')
  if (balanceA) {
    assert.equal(balanceA.balance, 400n, 'token A balance (100 + 300)')
    assert.equal(balanceA.utxos.length, 2, 'token A utxo count')
  }

  assert.ok(balanceB, 'token B present')
  if (balanceB) {
    assert.equal(balanceB.balance, 500n, 'token B balance (500, 0x02 spent)')
    assert.equal(balanceB.utxos.length, 1, 'token B utxo count')
  }

  assert.ok(balanceC, 'token C present')
  if (balanceC) {
    assert.equal(balanceC.balance, 400n, 'token C balance')
    assert.equal(balanceC.utxos.length, 1, 'token C utxo count')
  }
})

test('all notes spent returns empty', () => {
  const notes = [
    createNote({ nullifier: '0x01', amount: 100n }),
    createNote({ nullifier: '0x02', amount: 200n }),
    createNote({ nullifier: '0x03', amount: 300n }),
  ]

  const spentNullifiers = new Set(['0x01', '0x02', '0x03'])
  const result = aggregateBalances(notes, spentNullifiers)

  assert.ok(Array.isArray(result), 'returns array')
  assert.equal(result.length, 0, 'empty result when all spent')
})

test('zero-value notes handled correctly', () => {
  const notes = [
    createNote({ nullifier: '0x01', amount: 0n }),
    createNote({ nullifier: '0x02', amount: 100n }),
    createNote({ nullifier: '0x03', amount: 0n }),
    createNote({ nullifier: '0x04', amount: 200n }),
  ]

  const result = aggregateBalances(notes, new Set())

  assert.equal(result.length, 1, 'one token balance')
  if (result[0]) {
    assert.equal(result[0].balance, 300n, 'correct balance (0 + 100 + 0 + 200)')
    assert.equal(result[0].utxos.length, 4, 'all notes counted including zero-value')
  }
})

test('zero-value notes with some spent', () => {
  const notes = [
    createNote({ nullifier: '0x01', amount: 0n }),
    createNote({ nullifier: '0x02', amount: 100n }),
  ]

  const spentNullifiers = new Set(['0x02'])
  const result = aggregateBalances(notes, spentNullifiers)

  assert.equal(result.length, 1, 'one token balance')
  if (result[0]) {
    assert.equal(result[0].balance, 0n, 'balance is zero')
    assert.equal(result[0].utxos.length, 1, 'one unspent zero-value note')
  }
})

// ============================================================================
// getBalances() Tests
// ============================================================================

test('getBalances: returns Map of token addresses to balances', () => {
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createNote({ token: usdcAddress, nullifier: '0x01', amount: 100n }),
    createNote({ token: usdcAddress, nullifier: '0x02', amount: 200n }),
    createNote({ token: daiAddress, nullifier: '0x03', amount: 500n }),
  ]

  const balances = getBalances(notes, new Set())

  assert.ok(balances instanceof Map, 'returns a Map')
  assert.equal(balances.size, 2, 'contains 2 tokens')
  assert.equal(balances.get(usdcAddress), 300n, 'USDC balance correct')
  assert.equal(balances.get(daiAddress), 500n, 'DAI balance correct')
})

test('getBalances: returns empty Map for empty notes', () => {
  const balances = getBalances([], new Set())

  assert.ok(balances instanceof Map, 'returns a Map')
  assert.equal(balances.size, 0, 'Map is empty')
})

test('getBalances: excludes tokens with all notes spent', () => {
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createNote({ token: usdcAddress, nullifier: '0x01', amount: 100n }),
    createNote({ token: daiAddress, nullifier: '0x02', amount: 500n }),
  ]

  const spentNullifiers = new Set(['0x01']) // Spent USDC
  const balances = getBalances(notes, spentNullifiers)

  assert.equal(balances.size, 1, 'only one token with unspent balance')
  assert.equal(balances.get(daiAddress), 500n, 'DAI balance present')
  assert.equal(balances.get(usdcAddress), undefined, 'USDC not in map (all spent)')
})

test('getBalances: handles spent notes correctly', () => {
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

  const notes = [
    createNote({ token: usdcAddress, nullifier: '0x01', amount: 100n }),
    createNote({ token: usdcAddress, nullifier: '0x02', amount: 200n }),
    createNote({ token: usdcAddress, nullifier: '0x03', amount: 300n }),
  ]

  const spentNullifiers = new Set(['0x02'])
  const balances = getBalances(notes, spentNullifiers)

  assert.equal(balances.get(usdcAddress), 400n, 'balance excludes spent note')
})

test('aggregateBalances: ERC721 IDs in the same collection produce distinct entries', () => {
  const notes = [
    createNFTNote(`0x${'00'.repeat(31)}01`, { nullifier: '0x01' }),
    createNFTNote(`0x${'00'.repeat(31)}02`, { nullifier: '0x02' }),
  ]

  const result = aggregateBalances(notes, new Set())

  assert.equal(result.length, 2, 'two distinct token identities')
  for (const entry of result) {
    assert.equal(entry.token, NFT_COLLECTION, 'shared collection address')
    assert.equal(entry.tokenType, TokenType.ERC721, 'ERC721 entries')
    assert.equal(entry.balance, 1n, 'per-id balance is 1')
    assert.equal(entry.utxos.length, 1, 'one utxo per id')
  }
  const subIDs = result.map(b => b.tokenSubID).sort()
  assert.deepEqual(subIDs, [`0x${'00'.repeat(31)}01`, `0x${'00'.repeat(31)}02`], 'both token IDs present')
})

test('aggregateBalances: duplicate notes for one ERC721 identity merge into one entry', () => {
  const tokenSubID = `0x${'00'.repeat(31)}07`
  const notes = [
    createNFTNote(tokenSubID, { nullifier: '0x01' }),
    createNFTNote(tokenSubID, { nullifier: '0x02' }),
  ]

  const result = aggregateBalances(notes, new Set())

  assert.equal(result.length, 1, 'one identity')
  const entry = result[0]
  assert.ok(entry)
  if (entry) {
    assert.equal(entry.tokenType, TokenType.ERC721)
    assert.equal(entry.tokenSubID, tokenSubID)
    assert.equal(entry.balance, 2n, 'amounts summed across duplicate notes')
    assert.equal(entry.utxos.length, 2, 'both backing notes retained')
  }
})

test('aggregateBalances: spent ERC721 notes are excluded', () => {
  const tokenSubID = `0x${'00'.repeat(31)}03`
  const notes = [
    createNFTNote(tokenSubID, { nullifier: '0x01' }),
  ]

  const result = aggregateBalances(notes, new Set(['0x01']))

  assert.equal(result.length, 0, 'spent NFT excluded entirely')
})

test('aggregateBalances: mixed ERC20 and ERC721 produce correct distinct entries', () => {
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const notes = [
    createNote({ token: usdc, nullifier: '0x01', amount: 500n }),
    createNote({ token: usdc, nullifier: '0x02', amount: 250n }),
    createNFTNote(`0x${'00'.repeat(31)}0a`, { nullifier: '0x03' }),
    createNFTNote(`0x${'00'.repeat(31)}0b`, { nullifier: '0x04' }),
  ]

  const result = aggregateBalances(notes, new Set())

  assert.equal(result.length, 3, 'one ERC20 entry plus two NFT entries')

  const erc20 = result.find(b => b.tokenType === TokenType.ERC20)
  assert.ok(erc20, 'ERC20 entry present')
  if (erc20) {
    assert.equal(erc20.token, usdc)
    assert.equal(erc20.balance, 750n, 'ERC20 amounts summed')
  }

  const nfts = result.filter(b => b.tokenType === TokenType.ERC721)
  assert.equal(nfts.length, 2, 'two distinct ERC721 entries')
  for (const nft of nfts) {
    assert.equal(nft.token, NFT_COLLECTION)
    assert.equal(nft.balance, 1n)
  }
})

test('getTokenBalances: returns one entry per distinct identity (alias for aggregateBalances)', () => {
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const notes = [
    createNote({ token: usdc, nullifier: '0x01', amount: 100n }),
    createNFTNote(`0x${'00'.repeat(31)}aa`, { nullifier: '0x02' }),
  ]

  const result = getTokenBalances(notes, new Set())

  assert.equal(result.length, 2)
  assert.ok(result.some(b => b.tokenType === TokenType.ERC20 && b.token === usdc))
  assert.ok(result.some(b => b.tokenType === TokenType.ERC721 && b.tokenSubID === `0x${'00'.repeat(31)}aa`))
})

test('getBalances: excludes ERC721 notes even when address would collide', () => {
  const collidingAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const notes = [
    createNote({ token: collidingAddress, nullifier: '0x01', amount: 100n }),
    createNote({
      token: collidingAddress,
      nullifier: '0x02',
      amount: 1n,
      tokenType: TokenType.ERC721,
      tokenSubID: `0x${'00'.repeat(31)}05`,
    }),
  ]

  const balances = getBalances(notes, new Set())

  assert.equal(balances.size, 1, 'only one address entry')
  assert.equal(balances.get(collidingAddress), 100n, 'only ERC20 amount counted; ERC721 ignored')
})

test('getTokenBalance: excludes ERC721 notes that share the token address', () => {
  const collidingAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  const notes = [
    createNote({ token: collidingAddress, nullifier: '0x01', amount: 300n }),
    createNote({
      token: collidingAddress,
      nullifier: '0x02',
      amount: 1n,
      tokenType: TokenType.ERC721,
      tokenSubID: `0x${'00'.repeat(31)}05`,
    }),
  ]

  const balance = getTokenBalance(collidingAddress, notes, new Set())

  assert.equal(balance, 300n, 'ERC721 note not summed into fungible balance')
})

test('getTokenBalance: returns 0n when only ERC721 notes match the address', () => {
  const collection = NFT_COLLECTION
  const notes = [
    createNFTNote(`0x${'00'.repeat(31)}01`, { nullifier: '0x01', token: collection }),
    createNFTNote(`0x${'00'.repeat(31)}02`, { nullifier: '0x02', token: collection }),
  ]

  const balance = getTokenBalance(collection, notes, new Set())

  assert.equal(balance, 0n, 'no ERC20 notes for this address')
})
