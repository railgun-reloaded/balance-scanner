import type { DecryptedNote } from './types'

type TokenBalance = {
  token: string
  balance: bigint
  utxos: DecryptedNote[]
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

export type { TokenBalance }
export { aggregateBalances }
