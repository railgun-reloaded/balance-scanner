import type { CommitmentEvent, IndexedCiphertextRecord } from './types'

/**
 * Parses a TransactCommitment event.
 * @param event CommitmentEvent
 * @returns IndexedCiphertextRecord or undefined
 */
function parseTransactCommitment (event: CommitmentEvent): IndexedCiphertextRecord | undefined {
  const { args, blockNumber, transactionHash, transactionIndex, logIndex, name } = event
  if (!args) return undefined
  if ('ciphertext' in args && args.ciphertext) {
    const { ciphertext, blindedSenderViewingKey, blindedReceiverViewingKey, annotationData, memo } = args.ciphertext
    return {
      ciphertext,
      blindedSenderViewingKey,
      blindedReceiverViewingKey,
      annotationData,
      memo,
      transactionHash,
      blockNumber,
      transactionIndex,
      logIndex,
      treeNumber: args.treeNumber,
      treePosition: args.treePosition,
      eventName: name,
      commitmentHash: args.hash,
    }
  }
  return undefined
}

/**
 * Parses a TransactCommitmentV3 event.
 * @param event CommitmentEvent
 * @returns IndexedCiphertextRecord or undefined
 */
function parseTransactCommitmentV3 (event: CommitmentEvent): IndexedCiphertextRecord | undefined {
  const { args, blockNumber, transactionHash, transactionIndex, logIndex, name } = event
  if (!args) return undefined
  if ('ciphertext' in args && args.ciphertext) {
    const { ciphertext, blindedSenderViewingKey, blindedReceiverViewingKey } = args.ciphertext
    return {
      ciphertext,
      blindedSenderViewingKey,
      blindedReceiverViewingKey,
      transactionHash,
      blockNumber,
      transactionIndex,
      logIndex,
      treeNumber: args.treeNumber,
      treePosition: args.treePosition,
      eventName: name,
      commitmentHash: args.hash,
    }
  }
  return undefined
}

/**
 * Parses a ShieldCommitment event.
 * @param event CommitmentEvent
 * @returns IndexedCiphertextRecord or undefined
 */
function parseShieldCommitment (event: CommitmentEvent): IndexedCiphertextRecord | undefined {
  const { args, blockNumber, transactionHash, transactionIndex, logIndex, name } = event
  if (!args) return undefined
  if ('encryptedBundle' in args && Array.isArray(args.encryptedBundle) && 'preimage' in args && args.preimage) {
    return {
      encryptedBundle: args.encryptedBundle,
      preimage: args.preimage,
      transactionHash,
      blockNumber,
      transactionIndex,
      logIndex,
      treeNumber: args.treeNumber,
      treePosition: args.treePosition,
      eventName: name,
      commitmentHash: args.hash,
    }
  }
  return undefined
}

/**
 * Parses a LegacyTransactCommitment event.
 * @param event CommitmentEvent
 * @returns IndexedCiphertextRecord or undefined
 */
function parseLegacyTransactCommitment (event: CommitmentEvent): IndexedCiphertextRecord | undefined {
  const { args, blockNumber, transactionHash, transactionIndex, logIndex, name } = event
  if (!args) return undefined
  if ('ciphertext' in args && args.ciphertext) {
    const { ciphertext, blindedSenderViewingKey, blindedReceiverViewingKey, annotationData, memo } = args.ciphertext
    return {
      ciphertext,
      blindedSenderViewingKey,
      blindedReceiverViewingKey,
      annotationData,
      memo,
      transactionHash,
      blockNumber,
      transactionIndex,
      logIndex,
      treeNumber: args.treeNumber,
      treePosition: args.treePosition,
      eventName: name,
      commitmentHash: args.hash,
    }
  }
  return undefined
}

/**
 * Parses a LegacyShieldCommitment event.
 * @param event CommitmentEvent
 * @returns IndexedCiphertextRecord or undefined
 */
function parseLegacyShieldCommitment (event: CommitmentEvent): IndexedCiphertextRecord | undefined {
  const { args, blockNumber, transactionHash, transactionIndex, logIndex, name } = event
  if (!args) return undefined
  if ('encryptedBundle' in args && Array.isArray(args.encryptedBundle) && 'preimage' in args && args.preimage) {
    return {
      encryptedBundle: args.encryptedBundle,
      preimage: args.preimage,
      transactionHash,
      blockNumber,
      transactionIndex,
      logIndex,
      treeNumber: args.treeNumber,
      treePosition: args.treePosition,
      eventName: name,
      commitmentHash: args.hash,
    }
  }
  return undefined
}

export {
  parseLegacyTransactCommitment,
  parseTransactCommitment,
  parseShieldCommitment,
  parseTransactCommitmentV3,
  parseLegacyShieldCommitment
}
