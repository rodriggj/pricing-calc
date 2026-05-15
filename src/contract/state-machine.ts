// Contract Module — v1 estimate status state machine.
// Implements the transition table and predicate for INV-8 (AC-1).
//
// The v1 state machine (from design §"Status State Machine"):
//
//   [*] → DRAFT                          (initial state by convention)
//   DRAFT → AWAITING_APPROVAL            (Create Estimate)
//   AWAITING_APPROVAL → DRAFT            (User edits)
//   AWAITING_APPROVAL → APPROVED         (User approves)
//   APPROVED → QUEUED                    (Enqueue)
//   QUEUED → IN_PROGRESS                 (Agent 2 picks up)
//   IN_PROGRESS → COMPLETE               (All items succeeded)
//   IN_PROGRESS → PARTIALLY_COMPLETE     (Some items failed)
//   IN_PROGRESS → FAILED                 (Fatal error)
//   PARTIALLY_COMPLETE → QUEUED          (User retries failed items)
//   FAILED → QUEUED                      (User retries)
//   COMPLETE → [*]                       (terminal — no outgoing edges)
//
// No STALE status exists in v1 (per D-11 v1 ground rules).

import type { EstimateStatus } from './schema';

/**
 * Readonly transition table mapping each EstimateStatus to its legal
 * successor states. Every edge in the v1 state machine diagram is
 * enumerable from this map.
 *
 * Convention: DRAFT is the initial state ([*] → DRAFT). COMPLETE is
 * terminal (empty successors array).
 */
export const ESTIMATE_STATUS_TRANSITIONS: Readonly<
  Record<EstimateStatus, ReadonlyArray<EstimateStatus>>
> = {
  DRAFT: ['AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['DRAFT', 'APPROVED'],
  APPROVED: ['QUEUED'],
  QUEUED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETE', 'PARTIALLY_COMPLETE', 'FAILED'],
  COMPLETE: [],
  PARTIALLY_COMPLETE: ['QUEUED'],
  FAILED: ['QUEUED'],
};

/**
 * Returns `true` if and only if `(from, to)` is a legal edge in the v1
 * estimate status state machine.
 */
export function isLegalEstimateStatusTransition(
  from: EstimateStatus,
  to: EstimateStatus,
): boolean {
  const successors = ESTIMATE_STATUS_TRANSITIONS[from];
  return successors.includes(to);
}
