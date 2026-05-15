// Drizzle schema barrel.
//
// Re-exports the three Postgres enums, the five contract tables, the inferred
// row types, and the shared jsonb cell types. Consumed by `drizzle.config.ts`
// (migration generation), the Zod validators in `src/contract/`, and any API
// route that touches the database.

import type { InferSelectModel } from "drizzle-orm";

export {
  auditActionType,
  estimateStatus,
  lineItemStatus,
} from "./enums";

export { estimates } from "./estimates";
export { lineItems } from "./line-items";
export { architectureRevisions } from "./architecture-revisions";
export { shareUrlRevisions } from "./share-url-revisions";
export { estimateAuditLog } from "./estimate-audit-log";

export type {
  AuditDetails,
  Configuration,
  JsonValue,
  PromptMeta,
} from "./json-types";

import { estimates } from "./estimates";
import { lineItems } from "./line-items";
import { architectureRevisions } from "./architecture-revisions";
import { shareUrlRevisions } from "./share-url-revisions";
import { estimateAuditLog } from "./estimate-audit-log";

export type Estimate = InferSelectModel<typeof estimates>;
export type LineItem = InferSelectModel<typeof lineItems>;
export type ArchitectureRevision = InferSelectModel<typeof architectureRevisions>;
export type ShareUrlRevision = InferSelectModel<typeof shareUrlRevisions>;
export type EstimateAuditLogEntry = InferSelectModel<typeof estimateAuditLog>;
