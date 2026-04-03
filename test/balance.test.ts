// import { test } from 'brittle'

// import { aggregateBalances } from '../src/balance'
// import type { DecryptedNote } from '../src/types'

// const createNote = (overrides: Partial<DecryptedNote>): DecryptedNote => ({
//   commitment: '0x0000000000000000000000000000000000000000000000000000000000000000',
//   walletId: 'test-wallet',
//   nullifier: '0x1111111111111111111111111111111111111111111111111111111111111111',
//   token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
//   amount: 1000n,
//   blockNumber: 100n,
//   treeId: 0,
//   leafIndex: 0n,
//   commitmentType: 'standard',
//   outputType: null,
//   ...overrides,
// })

// test('empty notes array returns empty array', (t) => {
//   const result = aggregateBalances([], new Set())

//   t.ok(Array.isArray(result), 'returns array')
//   t.is(result.length, 0, 'empty result')
// })

// test('single token all unspent', (t) => {
//   const notes = [
//     createNote({ nullifier: '0x01', amount: 100n }),
//     createNote({ nullifier: '0x02', amount: 200n }),
//     createNote({ nullifier: '0x03', amount: 300n }),
//   ]

//   const result = aggregateBalances(notes, new Set())

//   t.is(result.length, 1, 'one token balance')
//   t.is(result[0].token, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'correct token')
//   t.is(result[0].balance, 600n, 'correct balance sum')
//   t.is(result[0].utxoCount, 3, 'correct utxo count')
// })

// test('single token some spent', (t) => {
//   const notes = [
//     createNote({ nullifier: '0x01', amount: 100n }),
//     createNote({ nullifier: '0x02', amount: 200n }),
//     createNote({ nullifier: '0x03', amount: 300n }),
//     createNote({ nullifier: '0x04', amount: 400n }),
//   ]

//   const spentNullifiers = new Set(['0x02', '0x04'])
//   const result = aggregateBalances(notes, spentNullifiers)

//   t.is(result.length, 1, 'one token balance')
//   t.is(result[0].balance, 400n, 'correct balance sum (100 + 300)')
//   t.is(result[0].utxoCount, 2, 'correct utxo count')
// })

// test('multiple tokens mixed', (t) => {
//   const tokenA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
//   const tokenB = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
//   const tokenC = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

//   const notes = [
//     createNote({ token: tokenA, nullifier: '0x01', amount: 100n }),
//     createNote({ token: tokenB, nullifier: '0x02', amount: 200n }),
//     createNote({ token: tokenA, nullifier: '0x03', amount: 300n }),
//     createNote({ token: tokenC, nullifier: '0x04', amount: 400n }),
//     createNote({ token: tokenB, nullifier: '0x05', amount: 500n }),
//   ]

//   const spentNullifiers = new Set(['0x02'])
//   const result = aggregateBalances(notes, spentNullifiers)

//   t.is(result.length, 3, 'three token balances')

//   const balanceA = result.find(b => b.token === tokenA)
//   const balanceB = result.find(b => b.token === tokenB)
//   const balanceC = result.find(b => b.token === tokenC)

//   t.ok(balanceA, 'token A present')
//   t.is(balanceA?.balance, 400n, 'token A balance (100 + 300)')
//   t.is(balanceA?.utxoCount, 2, 'token A utxo count')

//   t.ok(balanceB, 'token B present')
//   t.is(balanceB?.balance, 500n, 'token B balance (500, 0x02 spent)')
//   t.is(balanceB?.utxoCount, 1, 'token B utxo count')

//   t.ok(balanceC, 'token C present')
//   t.is(balanceC?.balance, 400n, 'token C balance')
//   t.is(balanceC?.utxoCount, 1, 'token C utxo count')
// })

// test('all notes spent returns empty', (t) => {
//   const notes = [
//     createNote({ nullifier: '0x01', amount: 100n }),
//     createNote({ nullifier: '0x02', amount: 200n }),
//     createNote({ nullifier: '0x03', amount: 300n }),
//   ]

//   const spentNullifiers = new Set(['0x01', '0x02', '0x03'])
//   const result = aggregateBalances(notes, spentNullifiers)

//   t.ok(Array.isArray(result), 'returns array')
//   t.is(result.length, 0, 'empty result when all spent')
// })

// test('zero-value notes handled correctly', (t) => {
//   const notes = [
//     createNote({ nullifier: '0x01', amount: 0n }),
//     createNote({ nullifier: '0x02', amount: 100n }),
//     createNote({ nullifier: '0x03', amount: 0n }),
//     createNote({ nullifier: '0x04', amount: 200n }),
//   ]

//   const result = aggregateBalances(notes, new Set())

//   t.is(result.length, 1, 'one token balance')
//   t.is(result[0].balance, 300n, 'correct balance (0 + 100 + 0 + 200)')
//   t.is(result[0].utxoCount, 4, 'all notes counted including zero-value')
// })

// test('zero-value notes with some spent', (t) => {
//   const notes = [
//     createNote({ nullifier: '0x01', amount: 0n }),
//     createNote({ nullifier: '0x02', amount: 100n }),
//   ]

//   const spentNullifiers = new Set(['0x02'])
//   const result = aggregateBalances(notes, spentNullifiers)

//   t.is(result.length, 1, 'one token balance')
//   t.is(result[0].balance, 0n, 'balance is zero')
//   t.is(result[0].utxoCount, 1, 'one unspent zero-value note')
// })
