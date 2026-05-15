// Postgres enum definitions backing the contract tables.
//
// Member sets are pinned to the v1 ground rules in D-11 v1 and D-30.3:
//   - `estimate_status`   — no `STALE` (deferred to roadmap).
//   - `line_item_status`  — no `SKIPPED`, no `UPDATED` (v1 keeps the lifecycle
//                           narrow: PENDING → IN_PROGRESS → ADDED | FAILED).
//   - `audit_action_type` — exactly the actions enumerated in D-30.3.
//
// The enums are imported by the per-table modules in the same directory.

import { pgEnum } from "drizzle-orm/pg-core";

export const estimateStatus = pgEnum("estimate_status", [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETE",
  "PARTIALLY_COMPLETE",
  "FAILED",
]);

export const lineItemStatus = pgEnum("line_item_status", [
  "PENDING",
  "IN_PROGRESS",
  "ADDED",
  "FAILED",
]);

export const auditActionType = pgEnum("audit_action_type", [
  "VIEWED",
  "CONTEXT_EDITED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DELETED",
  "APPROVED",
  "RUN_STARTED",
  "RUN_COMPLETED",
  "RUN_FAILED",
  "SHARE_URL_ADDED",
  "SHARE_URL_DELETED",
  "NAME_EDITED",
  "TEAM_MEMBER_INVITED",
  "TEAM_MEMBER_REMOVED",
]);
