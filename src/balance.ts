import { TokenType } from '@railgun-reloaded/wallet-node'

import type { DecryptedNote } from './types'

/**
 * Aggregated unspent balance for a single complete token identity. The triple
 * `(token, tokenType, tokenSubID)` uniquely identifies the token — for ERC20
 * the sub-ID is the canonical 256-bit null; for ERC721 each token ID has its
 * own entry.
 */
type TokenBalance = {
  /** Token contract address. */
  token: string
  /** Token-class enum (`ERC20`, `ERC721`). */
  tokenType: TokenType
  /** 32-byte sub-identifier as 0x-prefixed lowercase hex (canonical null for ERC20). */
  tokenSubID: string
  /** Sum of `amount` across the matching unspent notes. */
  balance: bigint
  /** Unspent notes that compose this balance. */
  utxos: DecryptedNote[]
}

/**
 * Build the composite identity key used to group notes by complete token
 * identity. Notes that share `(token, tokenType, tokenSubID)` collapse into a
 * single balance entry.
 * @param note - Note to derive the identity key from.
 * @returns Composite identity key.
 */
function tokenIdentityKey (note: DecryptedNote): string {
  return `${note.token}:${note.tokenType}:${note.tokenSubID}`
}

/**
 * Group unspent notes by complete token identity `(token, tokenType, tokenSubID)`.
 * Spent notes are excluded via `spentNullifiers`. ERC721 notes from the same
 * collection but different token IDs produce distinct entries; ERC20 notes
 * collapse into a single per-address entry.
 * @param notes - All decrypted notes owned by the wallet.
 * @param spentNullifiers - Set of nullifier hashes that have been spent.
 * @returns One `TokenBalance` per distinct token identity.
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
 * Get aggregated balances for every distinct token identity the wallet owns,
 * spanning ERC20 and ERC721 notes. Consumers can distinguish token classes by
 * inspecting `tokenType` on each entry.
 * @param notes - All decrypted notes owned by the wallet.
 * @param spentNullifiers - Set of nullifier hashes that have been spent.
 * @returns One `TokenBalance` per distinct token identity.
 */
function getTokenBalances (
  notes: DecryptedNote[],
  spentNullifiers: Set<string>
): TokenBalance[] {
  return aggregateBalances(notes, spentNullifiers)
}

/**
 * Get the ERC20 balance for a specific token address. ERC721 notes are
 * excluded; address matching is case-insensitive.
 * @param tokenAddress - ERC20 token contract address (case-insensitive).
 * @param notes - All decrypted notes owned by the wallet.
 * @param spentNullifiers - Set of nullifier hashes that have been spent.
 * @returns Total unspent ERC20 balance for the address, or `0n` if none.
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
 * Get ERC20 balances as a `Map` keyed by token address. ERC721 notes are
 * excluded so the address-keyed projection stays meaningful (NFTs need a
 * triple to be uniquely identified — see `getTokenBalances` for those).
 * @param notes - All decrypted notes owned by the wallet.
 * @param spentNullifiers - Set of nullifier hashes that have been spent.
 * @returns Map of ERC20 token address to summed balance.
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
export { aggregateBalances, getBalances, getTokenBalance, getTokenBalances }
