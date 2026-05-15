// Shared jsonb cell type aliases used by Drizzle column annotations
// (`.$type<X>()`). These are TypeScript-only brands — Postgres still stores the
// columns as plain `jsonb`. Tighter, service-specific shapes will land when API
// code starts producing/consuming them; for the schema layer the intentionally
// permissive shape keeps the DDL the source of truth.

/** Recursive JSON value matching what Postgres `jsonb` can round-trip. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * `line_items.configuration` jsonb. Constant across the five years per D-07.6.
 * Service-specific keys (e.g., `instanceType` for ec2) are validated by Zod at
 * the trust boundary, not by the schema layer.
 */
export type Configuration = { [key: string]: JsonValue };

/**
 * `architecture_revisions.prompt_metadata` jsonb. Optional; populated by
 * Agent 1 to record the prompt that produced the revision.
 */
export type PromptMeta = { [key: string]: JsonValue } | null;

/**
 * `estimate_audit_log.details` jsonb. Optional per-action context. Shape varies
 * by `auditActionType` and is validated where the entry is appended (per D-30.3
 * append-only invariant); the schema layer keeps it permissive.
 */
export type AuditDetails = { [key: string]: JsonValue } | null;
