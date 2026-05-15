import { describe, it, expect } from 'vitest';
import { projectToPerYearGroups } from './projection';
import type { EstimatePayload } from './schema';

// ---------------------------------------------------------------------------
// Inline fixture helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<EstimatePayload> = {}): EstimatePayload {
  return {
    id: 'est-001',
    ownerId: 'user-1',
    orgId: null,
    name: 'Test Estimate',
    status: 'DRAFT',
    yearOneStartMonth: '2024-06-01',
    pinnedArchitectureRevisionId: null,
    lineItems: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: Flat-quantity case
// ---------------------------------------------------------------------------

describe('projectToPerYearGroups', () => {
  describe('flat-quantity case', () => {
    it('includes the line item in all 5 year groups with equal quantity', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-flat',
            serviceCode: 'ec2',
            configuration: { instanceType: 't3.medium', vCpu: 2 },
            region: 'us-east-1',
            quantityPerYear: [10, 10, 10, 10, 10],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      expect(result.groups).toHaveLength(5);
      for (let k = 0; k < 5; k++) {
        expect(result.groups[k].items).toHaveLength(1);
        expect(result.groups[k].items[0].quantity).toBe(10);
        expect(result.groups[k].items[0].lineItemId).toBe('li-flat');
        expect(result.groups[k].items[0].serviceCode).toBe('ec2');
        expect(result.groups[k].items[0].configuration).toEqual({
          instanceType: 't3.medium',
          vCpu: 2,
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Sparse case (some zero years)
  // ---------------------------------------------------------------------------

  describe('sparse case', () => {
    it('includes the line item only in non-zero year groups', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-sparse',
            serviceCode: 's3',
            configuration: { storageClass: 'STANDARD', storageGib: 100 },
            region: 'us-east-1',
            quantityPerYear: [5, 0, 3, 0, 1],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      // Year 1: qty 5
      expect(result.groups[0].items).toHaveLength(1);
      expect(result.groups[0].items[0].quantity).toBe(5);

      // Year 2: empty
      expect(result.groups[1].items).toHaveLength(0);

      // Year 3: qty 3
      expect(result.groups[2].items).toHaveLength(1);
      expect(result.groups[2].items[0].quantity).toBe(3);

      // Year 4: empty
      expect(result.groups[3].items).toHaveLength(0);

      // Year 5: qty 1
      expect(result.groups[4].items).toHaveLength(1);
      expect(result.groups[4].items[0].quantity).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Test: All-years-zero case (verifies omission)
  // ---------------------------------------------------------------------------

  describe('all-years-zero case', () => {
    it('omits the line item from every group when all quantities are zero', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-zero',
            serviceCode: 'lambda',
            configuration: { memoryMb: 256 },
            region: 'us-east-1',
            quantityPerYear: [0, 0, 0, 0, 0],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      for (let k = 0; k < 5; k++) {
        expect(result.groups[k].items).toHaveLength(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Multiple line items — ordering by lineItemId ascending
  // ---------------------------------------------------------------------------

  describe('multiple line items ordering', () => {
    it('sorts items within each group by lineItemId ascending', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-zzz',
            serviceCode: 'rds',
            configuration: { engine: 'postgres' },
            region: 'us-east-1',
            quantityPerYear: [2, 2, 2, 2, 2],
            status: 'PENDING',
            failureReason: null,
          },
          {
            id: 'li-aaa',
            serviceCode: 'ec2',
            configuration: { instanceType: 't3.small' },
            region: 'us-east-1',
            quantityPerYear: [1, 1, 1, 1, 1],
            status: 'PENDING',
            failureReason: null,
          },
          {
            id: 'li-mmm',
            serviceCode: 's3',
            configuration: { storageClass: 'GLACIER' },
            region: 'us-east-1',
            quantityPerYear: [3, 0, 3, 0, 3],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      // Year 1: all three items present, sorted by id
      expect(result.groups[0].items.map((i) => i.lineItemId)).toEqual([
        'li-aaa',
        'li-mmm',
        'li-zzz',
      ]);

      // Year 2: only li-aaa and li-zzz (li-mmm has qty 0)
      expect(result.groups[1].items.map((i) => i.lineItemId)).toEqual([
        'li-aaa',
        'li-zzz',
      ]);

      // Year 3: all three
      expect(result.groups[2].items.map((i) => i.lineItemId)).toEqual([
        'li-aaa',
        'li-mmm',
        'li-zzz',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Year-start month computation
  // ---------------------------------------------------------------------------

  describe('year-start month computation', () => {
    it('computes startMonth as yearOneStartMonth + (yearIndex-1)*12 months', () => {
      const payload = makePayload({
        yearOneStartMonth: '2024-06-01',
        lineItems: [],
      });

      const result = projectToPerYearGroups(payload);

      expect(result.groups[0].startMonth).toBe('2024-06-01');
      expect(result.groups[1].startMonth).toBe('2025-06-01');
      expect(result.groups[2].startMonth).toBe('2026-06-01');
      expect(result.groups[3].startMonth).toBe('2027-06-01');
      expect(result.groups[4].startMonth).toBe('2028-06-01');
    });

    it('handles January anchor correctly', () => {
      const payload = makePayload({
        yearOneStartMonth: '2025-01-01',
        lineItems: [],
      });

      const result = projectToPerYearGroups(payload);

      expect(result.groups[0].startMonth).toBe('2025-01-01');
      expect(result.groups[1].startMonth).toBe('2026-01-01');
      expect(result.groups[2].startMonth).toBe('2027-01-01');
      expect(result.groups[3].startMonth).toBe('2028-01-01');
      expect(result.groups[4].startMonth).toBe('2029-01-01');
    });

    it('handles December anchor correctly', () => {
      const payload = makePayload({
        yearOneStartMonth: '2023-12-01',
        lineItems: [],
      });

      const result = projectToPerYearGroups(payload);

      expect(result.groups[0].startMonth).toBe('2023-12-01');
      expect(result.groups[1].startMonth).toBe('2024-12-01');
      expect(result.groups[2].startMonth).toBe('2025-12-01');
      expect(result.groups[3].startMonth).toBe('2026-12-01');
      expect(result.groups[4].startMonth).toBe('2027-12-01');
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Sum postcondition
  // ---------------------------------------------------------------------------

  describe('sum postcondition', () => {
    it('Σ groups[k].items[i].quantity == Σ lineItems[j].quantityPerYear[k] (where qpy[k]>0)', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-1',
            serviceCode: 'ec2',
            configuration: { instanceType: 't3.large' },
            region: 'us-east-1',
            quantityPerYear: [10, 0, 5, 0, 20],
            status: 'PENDING',
            failureReason: null,
          },
          {
            id: 'li-2',
            serviceCode: 's3',
            configuration: { storageGib: 500 },
            region: 'us-east-1',
            quantityPerYear: [3, 7, 0, 11, 0],
            status: 'PENDING',
            failureReason: null,
          },
          {
            id: 'li-3',
            serviceCode: 'lambda',
            configuration: { memoryMb: 128 },
            region: 'us-east-1',
            quantityPerYear: [0, 0, 0, 0, 0],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      // For each year k, verify the sum postcondition
      for (let k = 0; k < 5; k++) {
        // Sum of quantities in the projection group
        const projectionSum = result.groups[k].items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        // Sum of quantityPerYear[k] across all line items where qpy[k] > 0
        const inputSum = payload.lineItems.reduce((sum, li) => {
          const qty = li.quantityPerYear[k];
          return qty > 0 ? sum + qty : sum;
        }, 0);

        expect(projectionSum).toBe(inputSum);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Test: No input mutation
  // ---------------------------------------------------------------------------

  describe('no input mutation', () => {
    it('does not mutate the input payload', () => {
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-mut',
            serviceCode: 'dynamodb',
            configuration: { readCapacity: 5, writeCapacity: 5 },
            region: 'us-east-1',
            quantityPerYear: [1, 2, 3, 4, 5],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      // Deep clone the payload before calling the function
      const payloadSnapshot = JSON.parse(JSON.stringify(payload));

      projectToPerYearGroups(payload);

      // Verify the payload is unchanged
      expect(payload).toEqual(payloadSnapshot);
    });
  });

  // ---------------------------------------------------------------------------
  // Test: Output structure
  // ---------------------------------------------------------------------------

  describe('output structure', () => {
    it('returns estimateId and yearOneStartMonth from the input', () => {
      const payload = makePayload({
        id: 'est-xyz',
        yearOneStartMonth: '2025-03-01',
      });

      const result = projectToPerYearGroups(payload);

      expect(result.estimateId).toBe('est-xyz');
      expect(result.yearOneStartMonth).toBe('2025-03-01');
    });

    it('returns exactly 5 groups with correct yearIndex values', () => {
      const payload = makePayload();
      const result = projectToPerYearGroups(payload);

      expect(result.groups).toHaveLength(5);
      expect(result.groups[0].yearIndex).toBe(1);
      expect(result.groups[1].yearIndex).toBe(2);
      expect(result.groups[2].yearIndex).toBe(3);
      expect(result.groups[3].yearIndex).toBe(4);
      expect(result.groups[4].yearIndex).toBe(5);
    });

    it('carries configuration forward unchanged into year groups', () => {
      const config = { instanceType: 't3.micro', vCpu: 2, memoryGib: 1 };
      const payload = makePayload({
        lineItems: [
          {
            id: 'li-cfg',
            serviceCode: 'ec2',
            configuration: config,
            region: 'us-east-1',
            quantityPerYear: [1, 2, 3, 4, 5],
            status: 'PENDING',
            failureReason: null,
          },
        ],
      });

      const result = projectToPerYearGroups(payload);

      // Every group should have the same configuration
      for (let k = 0; k < 5; k++) {
        expect(result.groups[k].items[0].configuration).toEqual(config);
      }
    });
  });
});
