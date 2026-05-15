/**
 * Contract Module — public surface.
 *
 * This barrel re-exports every public symbol from the Estimate Format & Contract
 * spec. Downstream code imports as `@/contract` (or `../contract` depending on
 * path alias configuration).
 *
 * `parseEstimatePayload` is the trust boundary: it is the ONLY path that
 * converts `unknown` → `EstimatePayload`. No alternate path bypasses validation.
 * All downstream consumers (projection, renderers, Agent 2 wire format) accept
 * the validated type so the TypeScript compiler enforces the boundary (NFR-3).
 */

// ---------------------------------------------------------------------------
// Validators and parsers (Task 4)
// ---------------------------------------------------------------------------

export {
  EstimatePayloadSchema,
  LineItemSchema,
  PerYearGroupPayloadSchema,
  ShareUrlRevisionSchema,
  parseEstimatePayload,
  safeParseEstimatePayload,
  SERVICE_CODE_ALLOW_LIST,
  ESTIMATE_STATUSES,
  LINE_ITEM_STATUSES,
} from './schema';

// ---------------------------------------------------------------------------
// Error types (Task 4)
// ---------------------------------------------------------------------------

export { ContractInvariantError } from './errors';

// ---------------------------------------------------------------------------
// Projection (Task 5)
// ---------------------------------------------------------------------------

export { projectToPerYearGroups } from './projection';

// ---------------------------------------------------------------------------
// Markdown renderers (Tasks 6 & 7)
// ---------------------------------------------------------------------------

export { renderEstimateMd, renderArchitectureMd, formatConfig } from './markdown';

// ---------------------------------------------------------------------------
// State machine (Task 8)
// ---------------------------------------------------------------------------

export {
  isLegalEstimateStatusTransition,
  ESTIMATE_STATUS_TRANSITIONS,
} from './state-machine';

// ---------------------------------------------------------------------------
// Audit log (Task 9)
// ---------------------------------------------------------------------------

export { appendAuditLogEntry } from './audit-log';

// ---------------------------------------------------------------------------
// Version constants (Task 10)
// ---------------------------------------------------------------------------

export { CONTRACT_SCHEMA_VERSION, RENDERER_VERSION } from './versions';

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type {
  EstimatePayload,
  LineItem,
  Configuration,
  PerYearGroupPayload,
  YearGroup,
  YearGroupItem,
  ShareUrlRevision,
  ArchitectureRevision,
  EstimateStatus,
  LineItemStatus,
} from './schema';

export type {
  AuditActionType,
  AuditLogEntryInput,
  AuditLogEntryRow,
} from './audit-log';
