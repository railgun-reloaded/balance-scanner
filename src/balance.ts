import type { DecryptedNote } from './types'

/**
 * Balance information for a specific token.
 */
type TokenBalance = {
  /** Token contract address (ERC20 only) */
  token: string
  /** Total unspent balance across all UTXOs */
  balance: bigint
  /** List of unspent UTXOs for this token */
  utxos: DecryptedNote[]
}

/**
 * Aggregates unspent UTXO balances per token address.
 *
 * Currently supports ERC20 tokens only (tokenType = 0).
 * @param notes - All decrypted notes owned by the wallet
 * @param spentNullifiers - Set of nullifier hashes that have been spent
 * @returns Array of token balances, one per unique token address
 * @todo Add support for ERC721 (tokenType = 1) when NFT features are implemented.
 *       For ERC721, balance computation may need different semantics (count vs sum).
 * @example
 * ```typescript
 * const notes = [
 *   { token: '0xUSDC...', amount: 100n, nullifier: '0x01' },
 *   { token: '0xUSDC...', amount: 200n, nullifier: '0x02' },
 *   { token: '0xDAI...', amount: 50n, nullifier: '0x03' },
 * ]
 * const spent = new Set(['0x02'])
 *
 * const balances = aggregateBalances(notes, spent)
 * // [
 * //   { token: '0xUSDC...', balance: 100n, utxos: [...] },  // 0x02 was spent
 * //   { token: '0xDAI...', balance: 50n, utxos: [...] }
 * // ]
 * ```
 */
function aggregateBalances (
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): TokenBalance[] {
  if (notes.length === 0) {
    return []
  }

  const unspentNotes = notes.filter(note => !spentNullifiers.has(note.nullifier))

  if (unspentNotes.length === 0) {
    return []
  }

  const balanceMap = new Map<string, { balance: bigint; utxos: DecryptedNote[] }>()

  for (const note of unspentNotes) {
    const existing = balanceMap.get(note.token)
    if (existing) {
      existing.balance += note.amount
      existing.utxos.push(note)
    } else {
      balanceMap.set(note.token, { balance: note.amount, utxos: [note] })
    }
  }

  return Array.from(balanceMap.entries()).map(([token, { balance, utxos }]) => ({
    token,
    balance,
    utxos,
  }))
}

/**
 * Get the balance for a specific ERC20 token address.
 *
 * Convenience function that filters notes by token address and returns
 * the total unspent balance. Case-insensitive address matching.
 * @param tokenAddress - ERC20 token contract address (case-insensitive)
 * @param notes - All decrypted notes owned by the wallet
 * @param spentNullifiers - Set of nullifier hashes that have been spent
 * @returns Total unspent balance for the token, or 0n if no balance
 * @example
 * ```typescript
 * const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
 * const usdcBalance = getTokenBalance(usdcAddress, allNotes, spentSet)
 * console.log(`USDC Balance: ${usdcBalance}`) // 1000000n (1 USDC with 6 decimals)
 * ```
 */
function getTokenBalance (
  tokenAddress: string,
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): bigint {
  // Normalize address to lowercase for case-insensitive comparison
  const normalizedAddress = tokenAddress.toLowerCase()

  // Filter notes to only this token (case-insensitive)
  const tokenNotes = notes.filter(note =>
    note.token.toLowerCase() === normalizedAddress
  )

  // If no notes for this token, return 0
  if (tokenNotes.length === 0) {
    return 0n
  }

  // Aggregate balances - may have multiple entries if notes stored with different casing
  const balances = aggregateBalances(tokenNotes, spentNullifiers)

  // Sum all balances (handles case where notes were stored with mixed casing)
  return balances.reduce((sum, b) => sum + b.balance, 0n)
}

/**
 * Get all token balances as a Map.
 *
 * Convenience function that returns balances in a Map structure
 * for easy lookup by token address.
 * @param notes - All decrypted notes owned by the wallet
 * @param spentNullifiers - Set of nullifier hashes that have been spent
 * @returns Map of token address to balance
 * @example
 * ```typescript
 * const balances = getBalances(allNotes, spentSet)
 * const usdcBalance = balances.get('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
 * console.log(`USDC: ${usdcBalance}`) // 1000000n
 * ```
 */
function getBalances (
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): Map<string, bigint> {
  const balances = aggregateBalances(notes, spentNullifiers)
  return new Map(balances.map(b => [b.token, b.balance]))
}

export type { TokenBalance }
export { aggregateBalances, getTokenBalance, getBalances }
