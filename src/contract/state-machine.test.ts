import { describe, it, expect } from 'vitest';
import {
  ESTIMATE_STATUS_TRANSITIONS,
  isLegalEstimateStatusTransition,
} from './state-machine';
import { ESTIMATE_STATUSES } from './schema';
import type { EstimateStatus } from './schema';

// ---------------------------------------------------------------------------
// Transition table structure
// ---------------------------------------------------------------------------

describe('ESTIMATE_STATUS_TRANSITIONS', () => {
  it('has an entry for every EstimateStatus', () => {
    for (const status of ESTIMATE_STATUSES) {
      expect(ESTIMATE_STATUS_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(ESTIMATE_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it('COMPLETE is terminal (no outgoing edges)', () => {
    expect(ESTIMATE_STATUS_TRANSITIONS.COMPLETE).toHaveLength(0);
  });

  it('every successor value is a valid EstimateStatus', () => {
    const validSet = new Set<string>(ESTIMATE_STATUSES);
    for (const status of ESTIMATE_STATUSES) {
      for (const successor of ESTIMATE_STATUS_TRANSITIONS[status]) {
        expect(validSet.has(successor)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Legal transitions — every edge in the v1 state machine
// ---------------------------------------------------------------------------

describe('isLegalEstimateStatusTransition — legal transitions', () => {
  const legalEdges: Array<[EstimateStatus, EstimateStatus]> = [
    ['DRAFT', 'AWAITING_APPROVAL'],
    ['AWAITING_APPROVAL', 'DRAFT'],
    ['AWAITING_APPROVAL', 'APPROVED'],
    ['APPROVED', 'QUEUED'],
    ['QUEUED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETE'],
    ['IN_PROGRESS', 'PARTIALLY_COMPLETE'],
    ['IN_PROGRESS', 'FAILED'],
    ['PARTIALLY_COMPLETE', 'QUEUED'],
    ['FAILED', 'QUEUED'],
  ];

  it.each(legalEdges)(
    '%s → %s is legal',
    (from, to) => {
      expect(isLegalEstimateStatusTransition(from, to)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Illegal transitions — sample of invalid edges
// ---------------------------------------------------------------------------

describe('isLegalEstimateStatusTransition — illegal transitions', () => {
  const illegalEdges: Array<[EstimateStatus, EstimateStatus]> = [
    ['DRAFT', 'COMPLETE'],
    ['COMPLETE', 'DRAFT'],
    ['DRAFT', 'IN_PROGRESS'],
    ['FAILED', 'COMPLETE'],
    ['QUEUED', 'COMPLETE'],
    ['DRAFT', 'APPROVED'],
    ['DRAFT', 'QUEUED'],
    ['COMPLETE', 'QUEUED'],
    ['COMPLETE', 'IN_PROGRESS'],
    ['APPROVED', 'DRAFT'],
    ['QUEUED', 'DRAFT'],
  ];

  it.each(illegalEdges)(
    '%s → %s is illegal',
    (from, to) => {
      expect(isLegalEstimateStatusTransition(from, to)).toBe(false);
    },
  );

  it('self-transitions are illegal for all states', () => {
    for (const status of ESTIMATE_STATUSES) {
      expect(isLegalEstimateStatusTransition(status, status)).toBe(false);
    }
  });
});
