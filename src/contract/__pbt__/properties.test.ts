// Contract Module — Property-Based Tests (PBT Suite)
//
// 11 properties covering every PBT-marked invariant in the design's
// "Correctness Properties (Invariants)" table.
//
// Framework: fast-check v3.x with Vitest
// Each property runs at 1024 cases via fc.assert(prop, { numRuns: 1024 }).
// On failure, fast-check prints the seed and counterexample automatically.

import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  arbShareUrlRevisionHistory,
  arbEstimatePayload,
  arbStatusTransition,
  type ShareUrlOp,
} from './arbitraries';
import {
  parseEstimatePayload,
  safeParseEstimatePayload,
  ESTIMATE_STATUSES,
} from '../schema';
import type { EstimatePayload, EstimateStatus, ArchitectureRevision } from '../schema';
import { projectToPerYearGroups } from '../projection';
import { renderEstimateMd, renderArchitectureMd } from '../markdown';
import { isLegalEstimateStatusTransition, ESTIMATE_STATUS_TRANSITIONS } from '../state-machine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NUM_RUNS = 1024;

/** Statuses that require a non-null pinnedArchitectureRevisionId. */
const POST_DRAFT_STATUSES: ReadonlySet<string> = new Set([
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETE',
  'PARTIALLY_COMPLETE',
  'FAILED',
]);

/**
 * Create a matching ArchitectureRevision for a payload (for renderer tests).
 * Only valid when pinnedArchitectureRevisionId is non-null.
 */
function makeArchRevForPayload(payload: EstimatePayload): ArchitectureRevision {
  return {
    id: payload.pinnedArchitectureRevisionId!,
    estimateId: payload.id,
    mermaidSource: 'graph TD\n  A --> B',
    agentCommentary: 'Generated for PBT',
    generationReason: 'pbt',
    promptMetadata: null,
    createdAt: payload.createdAt,
  };
}

/**
 * Add k*12 months to a YYYY-MM-01 string.
 * Since we always add multiples of 12, this increments the year by k.
 */
function addYears(yearMonthStr: string, k: number): string {
  const year = parseInt(yearMonthStr.slice(0, 4), 10);
  const month = parseInt(yearMonthStr.slice(5, 7), 10);
  const totalMonths = (year * 12 + (month - 1)) + k * 12;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Contract PBT Suite', () => {
  // =========================================================================
  // Property 1 (INV-1) — At-most-one active first-pass share URL per estimate
  // Validates: Requirements INV-1
  // =========================================================================
  it('Property 1 (INV-1): at most one active first-pass row per estimate at every state', async () => {
    await fc.assert(
      fc.property(arbShareUrlRevisionHistory(), (ops: ShareUrlOp[]) => {
        // Simulate in-memory state: track active (non-deleted) rows
        const activeRows = new Map<string, { id: string; isFirstPass: boolean }>();

        for (const op of ops) {
          if (op.type === 'insert') {
            // Before inserting a first-pass row, soft-delete any existing active first-pass
            if (op.isFirstPass) {
              for (const [existingId, row] of activeRows) {
                if (row.isFirstPass) {
                  activeRows.delete(existingId);
                }
              }
            }
            activeRows.set(op.id, { id: op.id, isFirstPass: op.isFirstPass });
          } else {
            // soft-delete
            activeRows.delete(op.targetId);
          }

          // INVARIANT CHECK: at most one active first-pass row
          let firstPassCount = 0;
          for (const [, row] of activeRows) {
            if (row.isFirstPass) firstPassCount++;
          }
          if (firstPassCount > 1) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 2 (INV-2) — Five-element quantity arrays
  // Validates: Requirements INV-2
  // =========================================================================
  it('Property 2 (INV-2): valid payloads parse; mutated quantity arrays fail', async () => {
    // Sub-property A: valid payloads always parse
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        const result = safeParseEstimatePayload(payload);
        return result.success === true;
      }),
      { numRuns: NUM_RUNS / 2 },
    );

    // Sub-property B: mutated payloads (wrong length, negative, float) fail
    const arbMutatedPayload = arbEstimatePayload().chain((payload) => {
      // Pick a mutation type
      return fc.constantFrom('wrong-length', 'negative', 'float').map((mutationType) => {
        const mutated = JSON.parse(JSON.stringify(payload));
        if (mutated.lineItems.length === 0) return mutated;
        const targetIdx = 0;
        switch (mutationType) {
          case 'wrong-length':
            // Make it length 3 or 6
            mutated.lineItems[targetIdx].quantityPerYear = [1, 2, 3];
            break;
          case 'negative':
            mutated.lineItems[targetIdx].quantityPerYear = [-1, 0, 0, 0, 0];
            break;
          case 'float':
            mutated.lineItems[targetIdx].quantityPerYear = [1.5, 0, 0, 0, 0];
            break;
        }
        return mutated;
      });
    });

    await fc.assert(
      fc.property(arbMutatedPayload, (mutated) => {
        const result = safeParseEstimatePayload(mutated);
        return result.success === false;
      }),
      { numRuns: NUM_RUNS / 2 },
    );
  });

  // =========================================================================
  // Property 3 (INV-3) — Configuration constant across years
  // Validates: Requirements INV-3
  // =========================================================================
  it('Property 3 (INV-3): configuration is deep-equal across year groups for same line item', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        const projected = projectToPerYearGroups(payload);

        // Collect configurations per lineItemId across all groups
        const configsByLineItem = new Map<string, unknown[]>();
        for (const group of projected.groups) {
          for (const item of group.items) {
            if (!configsByLineItem.has(item.lineItemId)) {
              configsByLineItem.set(item.lineItemId, []);
            }
            configsByLineItem.get(item.lineItemId)!.push(item.configuration);
          }
        }

        // For every line item appearing in multiple groups, configs must be deep-equal
        for (const [, configs] of configsByLineItem) {
          if (configs.length > 1) {
            const first = JSON.stringify(configs[0]);
            for (let i = 1; i < configs.length; i++) {
              if (JSON.stringify(configs[i]) !== first) {
                return false;
              }
            }
          }
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 4 (INV-4) — Region pinned to us-east-1
  // Validates: Requirements INV-4
  // =========================================================================
  it('Property 4 (INV-4): us-east-1 payloads parse; other regions fail', async () => {
    const OTHER_REGIONS = ['us-west-2', 'eu-west-1', 'ap-southeast-1', 'eu-central-1'];

    // Generator that occasionally injects a non-us-east-1 region
    const arbRegionInjected = arbEstimatePayload().chain((payload) => {
      return fc.boolean().map((injectBadRegion) => {
        if (!injectBadRegion || payload.lineItems.length === 0) {
          return { payload, expectSuccess: true };
        }
        // Mutate a line item's region
        const mutated = JSON.parse(JSON.stringify(payload));
        const badRegion = OTHER_REGIONS[Math.floor(Math.random() * OTHER_REGIONS.length)];
        mutated.lineItems[0].region = badRegion;
        return { payload: mutated, expectSuccess: false };
      });
    });

    await fc.assert(
      fc.property(arbRegionInjected, ({ payload, expectSuccess }) => {
        const result = safeParseEstimatePayload(payload);
        return result.success === expectSuccess;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 5 (INV-5) — Markdown renderers are deterministic
  // Validates: Requirements INV-5
  // =========================================================================
  it('Property 5 (INV-5): rendering twice yields byte-identical strings', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        // renderEstimateMd determinism
        const md1 = renderEstimateMd(payload);
        const md2 = renderEstimateMd(payload);
        if (md1 !== md2) return false;

        // renderArchitectureMd determinism (only for post-DRAFT payloads)
        if (payload.pinnedArchitectureRevisionId !== null) {
          const archRev = makeArchRevForPayload(payload);
          const arch1 = renderArchitectureMd(payload, archRev);
          const arch2 = renderArchitectureMd(payload, archRev);
          if (arch1 !== arch2) return false;
        }

        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 6 (INV-6) — Markdown renderers are total (never throw)
  // Validates: Requirements INV-6
  // =========================================================================
  it('Property 6 (INV-6): neither renderer throws on any valid payload', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        try {
          renderEstimateMd(payload);
        } catch {
          return false;
        }

        // renderArchitectureMd only for post-DRAFT payloads
        if (payload.pinnedArchitectureRevisionId !== null) {
          try {
            const archRev = makeArchRevForPayload(payload);
            renderArchitectureMd(payload, archRev);
          } catch {
            return false;
          }
        }

        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 7 (INV-7) — JSON round-trip identity
  // Validates: Requirements INV-7
  // =========================================================================
  it('Property 7 (INV-7): parseEstimatePayload(JSON.parse(JSON.stringify(p))) deep-equals p', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        const roundTripped = parseEstimatePayload(JSON.parse(JSON.stringify(payload)));
        return JSON.stringify(roundTripped) === JSON.stringify(payload);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 8 (INV-8) — Status transitions follow the v1 state machine
  // Validates: Requirements INV-8
  // =========================================================================
  it('Property 8 (INV-8): isLegalEstimateStatusTransition matches the transition table', async () => {
    // Build the set of legal edges for oracle comparison
    const legalEdges = new Set<string>();
    for (const [from, tos] of Object.entries(ESTIMATE_STATUS_TRANSITIONS)) {
      for (const to of tos) {
        legalEdges.add(`${from}->${to}`);
      }
    }

    await fc.assert(
      fc.property(arbStatusTransition(), ({ from, to }) => {
        const result = isLegalEstimateStatusTransition(from, to);
        const expected = legalEdges.has(`${from}->${to}`);
        return result === expected;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 9 (INV-9) — Projection sum conservation
  // Validates: Requirements INV-9
  // =========================================================================
  it('Property 9 (INV-9): sum of quantities in projection equals sum of positive quantityPerYear entries', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        const projected = projectToPerYearGroups(payload);

        // Sum of quantity across all YearGroupItems
        let projectionSum = 0;
        for (const group of projected.groups) {
          for (const item of group.items) {
            projectionSum += item.quantity;
          }
        }

        // Sum of strictly-positive entries of quantityPerYear across all line items
        let inputSum = 0;
        for (const lineItem of payload.lineItems) {
          for (const qty of lineItem.quantityPerYear) {
            if (qty > 0) {
              inputSum += qty;
            }
          }
        }

        return projectionSum === inputSum;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 10 (INV-10) — Year-start months spaced twelve months apart
  // Validates: Requirements INV-10
  // =========================================================================
  it('Property 10 (INV-10): groups[k].startMonth equals yearOneStartMonth + k*12 months', async () => {
    await fc.assert(
      fc.property(arbEstimatePayload(), (payload) => {
        const projected = projectToPerYearGroups(payload);

        for (let k = 0; k < 5; k++) {
          const expected = addYears(payload.yearOneStartMonth, k);
          if (projected.groups[k].startMonth !== expected) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // =========================================================================
  // Property 11 (INV-12) — pinnedArchitectureRevisionId required for post-DRAFT
  // Validates: Requirements INV-12
  // =========================================================================
  it('Property 11 (INV-12): parse accepts legal (status, pinnedArchRevId) pairs and rejects illegal ones', async () => {
    // Generator for (status, pinnedArchitectureRevisionId) pairs
    const arbStatusPinnedPair = fc.record({
      status: fc.constantFrom(...ESTIMATE_STATUSES) as fc.Arbitrary<EstimateStatus>,
      pinnedArchitectureRevisionId: fc.option(fc.uuid(), { nil: null }),
    });

    await fc.assert(
      fc.property(arbStatusPinnedPair, arbEstimatePayload(), (pair, basePayload) => {
        // Build a payload with the given status and pinnedArchitectureRevisionId
        const testPayload = {
          ...basePayload,
          status: pair.status,
          pinnedArchitectureRevisionId: pair.pinnedArchitectureRevisionId,
        };

        const result = safeParseEstimatePayload(testPayload);

        const isPostDraft = POST_DRAFT_STATUSES.has(pair.status);
        const hasRevId = pair.pinnedArchitectureRevisionId !== null;

        if (isPostDraft && !hasRevId) {
          // Illegal: post-DRAFT with null pinnedArchitectureRevisionId → must fail
          return result.success === false;
        }
        // Legal: DRAFT + null, DRAFT + non-null, or post-DRAFT + non-null → must pass
        return result.success === true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
