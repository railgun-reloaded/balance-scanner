import type { CommitmentEvent } from '../../src/ciphertext'

/**
 * Async generator yielding events for async iterable ingestion test.
 * @param events Array of CommitmentEvent
 * @yields CommitmentEvent
 */
async function * eventGenerator (events: CommitmentEvent[]) {
  for (const e of events) yield e
}

export { eventGenerator }
