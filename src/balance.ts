import type { DecryptedNote } from './types'

type TokenBalance = {
  token: string
  balance: bigint
  utxoCount: number
}

function aggregateBalances(
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

  const balanceMap = new Map<string, { balance: bigint; count: number }>()

  for (const note of unspentNotes) {
    const existing = balanceMap.get(note.token)
    if (existing) {
      existing.balance += note.amount
      existing.count += 1
    } else {
      balanceMap.set(note.token, { balance: note.amount, count: 1 })
    }
  }

  return Array.from(balanceMap.entries()).map(([token, { balance, count }]) => ({
    token,
    balance,
    utxoCount: count,
  }))
}

export type { TokenBalance }
export { aggregateBalances }
