import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseEstimatePayload,
  safeParseEstimatePayload,
  EstimatePayloadSchema,
  LineItemSchema,
  PerYearGroupPayloadSchema,
  ShareUrlRevisionSchema,
  SERVICE_CODE_ALLOW_LIST,
} from './schema';
import { ContractInvariantError } from './errors';

// ---------------------------------------------------------------------------
// Helpers — valid fixture factory
// ---------------------------------------------------------------------------

function makeValidLineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li-001',
    serviceCode: 'ec2',
    configuration: { instanceType: 't3.medium', vCpu: 2 },
    region: 'us-east-1',
    quantityPerYear: [10, 20, 30, 40, 50],
    status: 'PENDING',
    failureReason: null,
    ...overrides,
  };
}

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'est-001',
    ownerId: 'user_abc',
    orgId: null,
    name: 'Test Estimate',
    status: 'DRAFT',
    yearOneStartMonth: '2024-01-01',
    pinnedArchitectureRevisionId: null,
    lineItems: [makeValidLineItem()],
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema exports exist (compile-time + runtime check)
// ---------------------------------------------------------------------------

describe('Schema exports', () => {
  it('exports EstimatePayloadSchema as a ZodSchema', () => {
    expect(EstimatePayloadSchema).toBeDefined();
    expect(typeof EstimatePayloadSchema.parse).toBe('function');
  });

  it('exports LineItemSchema as a ZodSchema', () => {
    expect(LineItemSchema).toBeDefined();
    expect(typeof LineItemSchema.parse).toBe('function');
  });

  it('exports SERVICE_CODE_ALLOW_LIST with 6 entries', () => {
    expect(SERVICE_CODE_ALLOW_LIST).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Happy path (FR-2 AC-7)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — happy path', () => {
  it('parses a valid DRAFT payload successfully', () => {
    const input = makeValidPayload();
    const result = parseEstimatePayload(input);

    expect(result).toEqual(input);
  });

  it('parses a valid post-DRAFT payload with non-null pinnedArchitectureRevisionId', () => {
    const input = makeValidPayload({
      status: 'APPROVED',
      pinnedArchitectureRevisionId: 'arch-rev-001',
    });
    const result = parseEstimatePayload(input);

    expect(result).toEqual(input);
  });

  it('returns a fresh deep clone (no aliasing with input)', () => {
    const input = makeValidPayload();
    const result = parseEstimatePayload(input);

    // Mutating the result should not affect the input
    result.lineItems[0].serviceCode = 'rds' as never;
    expect(input.lineItems[0].serviceCode).toBe('ec2');
  });

  it('safeParseEstimatePayload returns success for valid input', () => {
    const input = makeValidPayload();
    const result = safeParseEstimatePayload(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative cases — quantityPerYear (FR-2 AC-2)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — quantityPerYear validation', () => {
  it('rejects quantityPerYear with length ≠ 5 (too short)', () => {
    const input = makeValidPayload({
      lineItems: [makeValidLineItem({ quantityPerYear: [1, 2, 3, 4] })],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects quantityPerYear with length ≠ 5 (too long)', () => {
    const input = makeValidPayload({
      lineItems: [
        makeValidLineItem({ quantityPerYear: [1, 2, 3, 4, 5, 6] }),
      ],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects quantityPerYear with a negative number', () => {
    const input = makeValidPayload({
      lineItems: [makeValidLineItem({ quantityPerYear: [1, -1, 3, 4, 5] })],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects quantityPerYear with a non-integer (float)', () => {
    const input = makeValidPayload({
      lineItems: [makeValidLineItem({ quantityPerYear: [1, 2, 1.5, 4, 5] })],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('ZodError path identifies the offending line item and field', () => {
    const input = makeValidPayload({
      lineItems: [
        makeValidLineItem(),
        makeValidLineItem({ quantityPerYear: [1, 2, 3, 4] }),
      ],
    });

    const result = safeParseEstimatePayload(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      // Should reference lineItems.1.quantityPerYear
      expect(paths.some((p) => p.includes('lineItems.1.quantityPerYear'))).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative cases — region (FR-2 AC-3)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — region validation', () => {
  it('rejects region not equal to "us-east-1"', () => {
    const input = makeValidPayload({
      lineItems: [makeValidLineItem({ region: 'eu-west-1' })],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('ZodError path identifies the offending line item', () => {
    const input = makeValidPayload({
      lineItems: [
        makeValidLineItem(),
        makeValidLineItem({ region: 'ap-southeast-1' }),
      ],
    });

    const result = safeParseEstimatePayload(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('lineItems.1.region'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative cases — status (FR-2 AC-4)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — status validation', () => {
  it('rejects an invalid status value', () => {
    const input = makeValidPayload({ status: 'STALE' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects a completely bogus status', () => {
    const input = makeValidPayload({ status: 'NOT_A_STATUS' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Negative cases — yearOneStartMonth (FR-2 AC-5)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — yearOneStartMonth validation', () => {
  it('rejects yearOneStartMonth with invalid month (13)', () => {
    const input = makeValidPayload({ yearOneStartMonth: '2024-13-01' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects yearOneStartMonth with day ≠ 01', () => {
    const input = makeValidPayload({ yearOneStartMonth: '2024-01-15' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects yearOneStartMonth with month 00', () => {
    const input = makeValidPayload({ yearOneStartMonth: '2024-00-01' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects yearOneStartMonth in wrong format', () => {
    const input = makeValidPayload({ yearOneStartMonth: 'January 2024' });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Negative cases — cross-field refinement (FR-2 AC-6 / INV-12)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — pinnedArchitectureRevisionId refinement', () => {
  it('rejects post-DRAFT status with null pinnedArchitectureRevisionId', () => {
    const input = makeValidPayload({
      status: 'AWAITING_APPROVAL',
      pinnedArchitectureRevisionId: null,
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects APPROVED status with null pinnedArchitectureRevisionId', () => {
    const input = makeValidPayload({
      status: 'APPROVED',
      pinnedArchitectureRevisionId: null,
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('rejects IN_PROGRESS status with null pinnedArchitectureRevisionId', () => {
    const input = makeValidPayload({
      status: 'IN_PROGRESS',
      pinnedArchitectureRevisionId: null,
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('allows DRAFT status with null pinnedArchitectureRevisionId', () => {
    const input = makeValidPayload({
      status: 'DRAFT',
      pinnedArchitectureRevisionId: null,
    });

    const result = parseEstimatePayload(input);
    expect(result.status).toBe('DRAFT');
    expect(result.pinnedArchitectureRevisionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Negative cases — serviceCode (D-08 allow-list)
// ---------------------------------------------------------------------------

describe('EstimatePayloadSchema — serviceCode validation', () => {
  it('rejects an invalid service code', () => {
    const input = makeValidPayload({
      lineItems: [makeValidLineItem({ serviceCode: 'kinesis' })],
    });

    expect(() => parseEstimatePayload(input)).toThrow(ZodError);
  });

  it('accepts all valid service codes', () => {
    const validCodes = ['ec2', 's3', 'rds', 'lambda', 'dynamodb', 'cloudfront'];
    for (const code of validCodes) {
      const input = makeValidPayload({
        lineItems: [makeValidLineItem({ serviceCode: code })],
      });
      expect(() => parseEstimatePayload(input)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// ContractInvariantError
// ---------------------------------------------------------------------------

describe('ContractInvariantError', () => {
  it('is an instance of Error', () => {
    const err = new ContractInvariantError('mismatch');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "ContractInvariantError"', () => {
    const err = new ContractInvariantError('test message');
    expect(err.name).toBe('ContractInvariantError');
  });

  it('preserves the message', () => {
    const err = new ContractInvariantError('arch rev mismatch');
    expect(err.message).toBe('arch rev mismatch');
  });

  it('is an instance of ContractInvariantError', () => {
    const err = new ContractInvariantError('test');
    expect(err).toBeInstanceOf(ContractInvariantError);
  });
});

// ---------------------------------------------------------------------------
// ShareUrlRevisionSchema
// ---------------------------------------------------------------------------

describe('ShareUrlRevisionSchema', () => {
  it('accepts a valid share URL revision', () => {
    const input = {
      id: 'rev-001',
      estimateId: 'est-001',
      shareUrl: 'https://calculator.aws/#/estimate?id=abc-123',
      isFirstPass: true,
      createdBy: 'user_abc',
      note: null,
      createdAt: '2024-01-15T00:00:00.000Z',
      deletedAt: null,
    };

    const result = ShareUrlRevisionSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('rejects a share URL that does not match the pattern', () => {
    const input = {
      id: 'rev-001',
      estimateId: 'est-001',
      shareUrl: 'https://example.com/not-a-calculator-url',
      isFirstPass: false,
      createdBy: 'user_abc',
      note: null,
      createdAt: '2024-01-15T00:00:00.000Z',
      deletedAt: null,
    };

    expect(() => ShareUrlRevisionSchema.parse(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// PerYearGroupPayloadSchema
// ---------------------------------------------------------------------------

describe('PerYearGroupPayloadSchema', () => {
  it('accepts a valid per-year-group payload', () => {
    const makeGroup = (yearIndex: number, startMonth: string) => ({
      yearIndex,
      startMonth,
      items: [
        {
          lineItemId: 'li-001',
          serviceCode: 'ec2' as const,
          configuration: { instanceType: 't3.medium' },
          region: 'us-east-1' as const,
          quantity: 10,
        },
      ],
    });

    const input = {
      estimateId: 'est-001',
      yearOneStartMonth: '2024-01-01',
      groups: [
        makeGroup(1, '2024-01-01'),
        makeGroup(2, '2025-01-01'),
        makeGroup(3, '2026-01-01'),
        makeGroup(4, '2027-01-01'),
        makeGroup(5, '2028-01-01'),
      ],
    };

    const result = PerYearGroupPayloadSchema.parse(input);
    expect(result.groups).toHaveLength(5);
  });
});
