// Contract Module — PBT shared generators (fast-check Arbitraries).
//
// These generators produce random but schema-valid instances of the contract
// types for property-based testing. Each generator is documented with the
// invariant(s) it supports.

import fc from 'fast-check';
import type { EstimatePayload, LineItem, EstimateStatus, LineItemStatus } from '../schema';
import { SERVICE_CODE_ALLOW_LIST, ESTIMATE_STATUSES, LINE_ITEM_STATUSES } from '../schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// arbConfig — random JSON object with bounded depth (max 2) and key count (max 5)
// ---------------------------------------------------------------------------

/**
 * Generates a random JSON-safe configuration object.
 * Keys are alphanumeric strings (1-8 chars). Values are strings, numbers,
 * booleans, or null. Max depth 2, max 5 keys per level.
 */
export function arbConfig(): fc.Arbitrary<Record<string, unknown>> {
  const arbLeafValue = fc.oneof(
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
  );

  const arbKey = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);

  // Depth-1 nested object (used as values in depth-0 objects)
  const arbNestedObject = fc.dictionary(arbKey, arbLeafValue, { minKeys: 0, maxKeys: 3 });

  // Top-level value can be a leaf or a nested object (depth 2 max)
  const arbValue = fc.oneof(
    { weight: 4, arbitrary: arbLeafValue },
    { weight: 1, arbitrary: arbNestedObject },
  );

  return fc.dictionary(arbKey, arbValue, { minKeys: 0, maxKeys: 5 });
}

// ---------------------------------------------------------------------------
// arbLineItem — random valid line item
// ---------------------------------------------------------------------------

/**
 * Generates a random valid LineItem conforming to the schema.
 * - serviceCode from SERVICE_CODE_ALLOW_LIST
 * - region pinned to 'us-east-1'
 * - quantityPerYear: length-5 tuple of non-negative bounded integers (0-100)
 * - status from LINE_ITEM_STATUSES
 * - id: random UUID
 * - failureReason: null
 */
export function arbLineItem(): fc.Arbitrary<LineItem> {
  return fc.record({
    id: fc.uuid(),
    serviceCode: fc.constantFrom(...SERVICE_CODE_ALLOW_LIST),
    configuration: arbConfig(),
    region: fc.constant('us-east-1' as const),
    quantityPerYear: fc.tuple(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
    ),
    status: fc.constantFrom(...LINE_ITEM_STATUSES) as fc.Arbitrary<LineItemStatus>,
    failureReason: fc.constant(null),
  }) as fc.Arbitrary<LineItem>;
}

// ---------------------------------------------------------------------------
// arbEstimatePayload — random valid EstimatePayload
// ---------------------------------------------------------------------------

/**
 * Generates a first-of-month date string in YYYY-MM-01 form.
 * Years 2020-2030, months 01-12.
 */
function arbYearMonthFirst(): fc.Arbitrary<string> {
  return fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
    })
    .map(({ year, month }) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`);
}

/**
 * Generates a random valid EstimatePayload.
 * - Composes 1-10 arbLineItems
 * - Random UUID for id
 * - Alphanumeric name
 * - Anchor month (first-of-month, years 2020-2030)
 * - Status from ESTIMATE_STATUSES
 * - pinnedArchitectureRevisionId: non-null UUID when status is post-DRAFT, null for DRAFT
 */
export function arbEstimatePayload(): fc.Arbitrary<EstimatePayload> {
  return fc
    .record({
      id: fc.uuid(),
      ownerId: fc.uuid(),
      orgId: fc.option(fc.uuid(), { nil: null }),
      name: fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      status: fc.constantFrom(...ESTIMATE_STATUSES) as fc.Arbitrary<EstimateStatus>,
      yearOneStartMonth: arbYearMonthFirst(),
      lineItems: fc.array(arbLineItem(), { minLength: 1, maxLength: 10 }),
      createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map((d) => d.toISOString()),
      updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map((d) => d.toISOString()),
      pinnedArchRevSeed: fc.uuid(),
    })
    .map((raw) => {
      const isPostDraft = POST_DRAFT_STATUSES.has(raw.status);
      return {
        id: raw.id,
        ownerId: raw.ownerId,
        orgId: raw.orgId,
        name: raw.name,
        status: raw.status,
        yearOneStartMonth: raw.yearOneStartMonth,
        pinnedArchitectureRevisionId: isPostDraft ? raw.pinnedArchRevSeed : null,
        lineItems: raw.lineItems,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      } as EstimatePayload;
    });
}

// ---------------------------------------------------------------------------
// arbStatusTransition — biased generator for (from, to) status pairs
// ---------------------------------------------------------------------------

/**
 * Generates (from, to) status pairs.
 * ~50% of the time yields a legal transition (from the ESTIMATE_STATUS_TRANSITIONS table).
 * ~50% of the time yields an arbitrary (status, status) pair (may or may not be legal).
 */
export function arbStatusTransition(): fc.Arbitrary<{ from: EstimateStatus; to: EstimateStatus }> {
  // Legal transitions enumerated
  const legalPairs: Array<{ from: EstimateStatus; to: EstimateStatus }> = [
    { from: 'DRAFT', to: 'AWAITING_APPROVAL' },
    { from: 'AWAITING_APPROVAL', to: 'DRAFT' },
    { from: 'AWAITING_APPROVAL', to: 'APPROVED' },
    { from: 'APPROVED', to: 'QUEUED' },
    { from: 'QUEUED', to: 'IN_PROGRESS' },
    { from: 'IN_PROGRESS', to: 'COMPLETE' },
    { from: 'IN_PROGRESS', to: 'PARTIALLY_COMPLETE' },
    { from: 'IN_PROGRESS', to: 'FAILED' },
    { from: 'PARTIALLY_COMPLETE', to: 'QUEUED' },
    { from: 'FAILED', to: 'QUEUED' },
  ];

  const arbLegal = fc.constantFrom(...legalPairs);
  const arbArbitrary = fc.record({
    from: fc.constantFrom(...ESTIMATE_STATUSES) as fc.Arbitrary<EstimateStatus>,
    to: fc.constantFrom(...ESTIMATE_STATUSES) as fc.Arbitrary<EstimateStatus>,
  });

  return fc.oneof(
    { weight: 1, arbitrary: arbLegal },
    { weight: 1, arbitrary: arbArbitrary },
  );
}

// ---------------------------------------------------------------------------
// arbShareUrlRevisionHistory — sequences of share URL revision operations
// ---------------------------------------------------------------------------

export type ShareUrlOp =
  | { type: 'insert'; id: string; isFirstPass: boolean }
  | { type: 'soft-delete'; targetId: string };

/**
 * Generates a sequence of share URL revision operations (inserts and soft-deletes)
 * against a single estimate id. Each revision has `isFirstPass` randomly set.
 * Used to verify the at-most-one-active-first-pass invariant (INV-1).
 */
export function arbShareUrlRevisionHistory(): fc.Arbitrary<ShareUrlOp[]> {
  // Generate a sequence of operations
  return fc
    .array(
      fc.record({
        id: fc.uuid(),
        isFirstPass: fc.boolean(),
        // Whether this op is an insert or a soft-delete of a previous insert
        isInsert: fc.boolean(),
      }),
      { minLength: 1, maxLength: 20 },
    )
    .map((rawOps) => {
      const ops: ShareUrlOp[] = [];
      const insertedIds: string[] = [];

      for (const raw of rawOps) {
        if (raw.isInsert || insertedIds.length === 0) {
          // Insert a new revision
          ops.push({ type: 'insert', id: raw.id, isFirstPass: raw.isFirstPass });
          insertedIds.push(raw.id);
        } else {
          // Soft-delete a previously inserted revision
          const targetIndex = Math.abs(raw.id.charCodeAt(0)) % insertedIds.length;
          ops.push({ type: 'soft-delete', targetId: insertedIds[targetIndex] });
        }
      }

      return ops;
    });
}
