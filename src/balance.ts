import { TokenType } from '@railgun-reloaded/wallet-node'

import type { DecryptedNote } from './types'

/**
 * Aggregated unspent balance for a single token identity.
 */
type TokenBalance = {
  /** Token contract address. */
  token: string
  /** Token-class enum. */
  tokenType: TokenType
  /** 32-byte sub-identifier as 0x-prefixed lowercase hex. */
  tokenSubID: string
  /** Sum of `amount` across `utxos`. */
  balance: bigint
  /** Unspent notes that compose this balance. */
  utxos: DecryptedNote[]
}

/**
 * Composite identity key for a decrypted note. `token` and `tokenSubID` are
 * lowercased so notes that share an identity but arrived with different
 * casing collapse into one balance entry.
 * @param note - Source note.
 * @returns `"${token}:${tokenType}:${tokenSubID}"` (normalized).
 */
function tokenIdentityKey (note: DecryptedNote): string {
  return `${note.token.toLowerCase()}:${note.tokenType}:${note.tokenSubID.toLowerCase()}`
}

/**
 * Aggregate unspent notes into one entry per `(token, tokenType, tokenSubID)`.
 * @param notes - Decrypted notes.
 * @param spentNullifiers - Nullifier hashes to exclude.
 * @returns Aggregated balances.
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

  const balanceMap = new Map<string, TokenBalance>()

  for (const note of unspentNotes) {
    const key = tokenIdentityKey(note)
    const existing = balanceMap.get(key)
    if (existing) {
      existing.balance += note.amount
      existing.utxos.push(note)
    } else {
      balanceMap.set(key, {
        token: note.token,
        tokenType: note.tokenType,
        tokenSubID: note.tokenSubID,
        balance: note.amount,
        utxos: [note],
      })
    }
  }

  return Array.from(balanceMap.values())
}

/**
 * Aggregate balances for every distinct token identity.
 * @param notes - Decrypted notes.
 * @param spentNullifiers - Nullifier hashes to exclude.
 * @returns Aggregated balances.
 */
function getTokenBalances (
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): TokenBalance[] {
  return aggregateBalances(notes, spentNullifiers)
}

/**
 * Sum unspent ERC20 amounts for a token address. Address matching is
 * case-insensitive.
 * @param tokenAddress - ERC20 token contract address.
 * @param notes - Decrypted notes.
 * @param spentNullifiers - Nullifier hashes to exclude.
 * @returns Total balance, or `0n` if none.
 */
function getTokenBalance (
  tokenAddress: string,
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): bigint {
  const normalizedAddress = tokenAddress.toLowerCase()

  const erc20Notes = notes.filter(note =>
    note.tokenType === TokenType.ERC20 &&
    note.token.toLowerCase() === normalizedAddress
  )

  if (erc20Notes.length === 0) {
    return 0n
  }

  const balances = aggregateBalances(erc20Notes, spentNullifiers)

  return balances.reduce((sum, b) => sum + b.balance, 0n)
}

/**
 * ERC20 balances keyed by token address.
 * @param notes - Decrypted notes.
 * @param spentNullifiers - Nullifier hashes to exclude.
 * @returns Map of token address to summed balance.
 */
function getBalances (
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): Map<string, bigint> {
  const erc20Notes = notes.filter(note => note.tokenType === TokenType.ERC20)
  const balances = aggregateBalances(erc20Notes, spentNullifiers)
  return new Map(balances.map(b => [b.token, b.balance]))
}

export type { TokenBalance }
export { getBalances, getTokenBalance, getTokenBalances }
