/**
 * Checks if a CommitmentEvent has ciphertext or encryptedBundle (legacy or new).
 * @param obj CommitmentEvent or similar object
 * @param obj.args Arguments object, may contain ciphertext or encryptedBundle
 * @param obj.args.ciphertext Ciphertext property, if present
 * @param obj.args.encryptedBundle Encrypted bundle property, if present
 * @returns boolean
 */
function hasCiphertext (obj: any): boolean {
  if (!obj || !obj.args) return false
  if (obj.args.ciphertext && typeof obj.args.ciphertext === 'object') return true
  if (Array.isArray(obj.args.encryptedBundle) && obj.args.encryptedBundle.length > 0) return true
  return false
}

export { hasCiphertext }
