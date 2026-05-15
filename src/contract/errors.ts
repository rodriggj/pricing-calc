// Contract Module — error types.
//
// `ContractInvariantError` is thrown by the architecture renderer when
// `archRev.id !== payload.pinnedArchitectureRevisionId` and by any path that
// detects a stronger-than-Zod invariant violation at runtime.

/**
 * Thrown when a contract invariant is violated at runtime — conditions that
 * cannot be expressed purely in Zod (e.g., cross-entity mismatches between a
 * payload and an architecture revision).
 */
export class ContractInvariantError extends Error {
  override readonly name = 'ContractInvariantError';

  constructor(message: string) {
    super(message);
    // Restore prototype chain for instanceof checks in transpiled environments.
    Object.setPrototypeOf(this, ContractInvariantError.prototype);
  }
}
