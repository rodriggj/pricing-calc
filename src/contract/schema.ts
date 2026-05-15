// Contract Module — Zod validators and TypeScript type aliases for the wire payload.
//
// This module is the trust boundary: `parseEstimatePayload` is the only path
// that converts `unknown` → `EstimatePayload`. Downstream consumers (projection,
// renderers) accept the validated type so the TypeScript compiler enforces that
// callers pass through validation first.

import { z, type SafeParseReturnType } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** D-08 service-code vocabulary for v1. */
export const SERVICE_CODE_ALLOW_LIST = [
  'ec2',
  's3',
  'rds',
  'lambda',
  'dynamodb',
  'cloudfront',
] as const;

/** v1 estimate statuses (mirrors src/db/schema/enums.ts). */
export const ESTIMATE_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETE',
  'PARTIALLY_COMPLETE',
  'FAILED',
] as const;

/** v1 line-item statuses (mirrors src/db/schema/enums.ts). */
export const LINE_ITEM_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'ADDED',
  'FAILED',
] as const;

/** Statuses that require a non-null `pinnedArchitectureRevisionId`. */
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
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** Recursive JSON value matching Postgres jsonb round-trip. */
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** Configuration jsonb — must be an object (not array, not primitive). */
const ConfigurationSchema = z.record(z.string(), JsonValueSchema);

/**
 * Exactly five non-negative integers.
 * Zod's `.int()` rejects floats; `.min(0)` rejects negatives.
 */
const QuantityPerYearSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
]);

// ---------------------------------------------------------------------------
// LineItemSchema
// ---------------------------------------------------------------------------

export const LineItemSchema = z.object({
  id: z.string(),
  serviceCode: z.enum(SERVICE_CODE_ALLOW_LIST),
  configuration: ConfigurationSchema,
  region: z.literal('us-east-1'),
  quantityPerYear: QuantityPerYearSchema,
  status: z.enum(LINE_ITEM_STATUSES),
  failureReason: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// EstimatePayloadSchema
// ---------------------------------------------------------------------------

/**
 * Regex enforcing `YYYY-MM-01` where MM is 01–12.
 * Rejects invalid months (00, 13+) and non-first days.
 */
const YEAR_MONTH_FIRST_REGEX = /^\d{4}-(0[1-9]|1[0-2])-01$/;

const EstimatePayloadBaseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  orgId: z.string().nullable(),
  name: z.string(),
  status: z.enum(ESTIMATE_STATUSES),
  yearOneStartMonth: z.string().regex(YEAR_MONTH_FIRST_REGEX, {
    message: 'yearOneStartMonth must be in YYYY-MM-01 form (first of month)',
  }),
  pinnedArchitectureRevisionId: z.string().nullable(),
  lineItems: z.array(LineItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Full EstimatePayload schema with cross-field refinement:
 * `pinnedArchitectureRevisionId` must be non-null when status is post-DRAFT.
 */
export const EstimatePayloadSchema = EstimatePayloadBaseSchema.refine(
  (data) => {
    if (POST_DRAFT_STATUSES.has(data.status)) {
      return data.pinnedArchitectureRevisionId !== null;
    }
    return true;
  },
  {
    message:
      'pinnedArchitectureRevisionId must be non-null when status is past DRAFT',
    path: ['pinnedArchitectureRevisionId'],
  },
);

// ---------------------------------------------------------------------------
// PerYearGroupPayloadSchema
// ---------------------------------------------------------------------------

const YearGroupItemSchema = z.object({
  lineItemId: z.string(),
  serviceCode: z.enum(SERVICE_CODE_ALLOW_LIST),
  configuration: ConfigurationSchema,
  region: z.literal('us-east-1'),
  quantity: z.number().int().min(0),
});

const YearGroupSchema = z.object({
  yearIndex: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  startMonth: z.string().regex(YEAR_MONTH_FIRST_REGEX),
  items: z.array(YearGroupItemSchema),
});

export const PerYearGroupPayloadSchema = z.object({
  estimateId: z.string(),
  yearOneStartMonth: z.string().regex(YEAR_MONTH_FIRST_REGEX),
  groups: z.tuple([
    YearGroupSchema,
    YearGroupSchema,
    YearGroupSchema,
    YearGroupSchema,
    YearGroupSchema,
  ]),
});

// ---------------------------------------------------------------------------
// ShareUrlRevisionSchema
// ---------------------------------------------------------------------------

/**
 * Validates URLs matching the AWS Pricing Calculator share URL shape:
 * `https://calculator.aws/#/estimate?id=<uuid-or-id>`
 */
const SHARE_URL_REGEX =
  /^https:\/\/calculator\.aws\/#\/estimate\?id=.+$/;

export const ShareUrlRevisionSchema = z.object({
  id: z.string(),
  estimateId: z.string(),
  shareUrl: z.string().regex(SHARE_URL_REGEX, {
    message:
      'shareUrl must match https://calculator.aws/#/estimate?id=<id> pattern',
  }),
  isFirstPass: z.boolean(),
  createdBy: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export type LineItemStatus = (typeof LINE_ITEM_STATUSES)[number];
export type Configuration = z.infer<typeof ConfigurationSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type EstimatePayload = z.infer<typeof EstimatePayloadSchema>;
export type YearGroupItem = z.infer<typeof YearGroupItemSchema>;
export type YearGroup = z.infer<typeof YearGroupSchema>;
export type PerYearGroupPayload = z.infer<typeof PerYearGroupPayloadSchema>;
export type ShareUrlRevision = z.infer<typeof ShareUrlRevisionSchema>;

// ---------------------------------------------------------------------------
// ArchitectureRevision type (wire form for the architecture renderer)
// ---------------------------------------------------------------------------

/**
 * Minimal wire-form type for architecture revisions consumed by the renderer.
 * Compatible with the DB row type (`InferSelectModel<typeof architectureRevisions>`)
 * but uses string timestamps for JSON serialization.
 */
export type ArchitectureRevision = {
  id: string;
  estimateId: string;
  mermaidSource: string;
  agentCommentary: string | null;
  generationReason: string;
  promptMetadata: Record<string, unknown> | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Parser functions
// ---------------------------------------------------------------------------

/**
 * Parse and validate an unknown input as an `EstimatePayload`.
 *
 * Throws `ZodError` with structured paths on validation failure.
 * Returns a **fresh deep clone** — no aliasing with the input object.
 */
export function parseEstimatePayload(input: unknown): EstimatePayload {
  const parsed = EstimatePayloadSchema.parse(input);
  // Deep clone to guarantee no aliasing with the input.
  return JSON.parse(JSON.stringify(parsed)) as EstimatePayload;
}

/**
 * Safe (non-throwing) variant of `parseEstimatePayload`.
 * Returns Zod's `SafeParseReturnType` for callers that prefer error handling
 * without exceptions.
 */
export function safeParseEstimatePayload(
  input: unknown,
): SafeParseReturnType<z.input<typeof EstimatePayloadSchema>, EstimatePayload> {
  const result = EstimatePayloadSchema.safeParse(input);
  if (result.success) {
    // Deep clone the successful result to prevent aliasing.
    return {
      success: true,
      data: JSON.parse(JSON.stringify(result.data)) as EstimatePayload,
    };
  }
  return result;
}
