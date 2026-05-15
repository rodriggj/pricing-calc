/**
 * Contract Module — Append-only audit log helper.
 *
 * This module exists to enforce the application-layer append-only invariant
 * (I-11, per D-30.3). It exposes ONLY insertion helpers for the
 * `estimate_audit_log` table. No `update*` or `delete*` functions are exported.
 *
 * The harness's structural check (Task 13) verifies that this module's public
 * API surface stays clean — i.e., no mutation functions leak out over time.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { estimateAuditLog } from "../db/schema/estimate-audit-log";
import type { AuditDetails } from "../db/schema/json-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Union of valid audit action type values from the `audit_action_type` enum.
 */
export type AuditActionType =
  | "VIEWED"
  | "CONTEXT_EDITED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DELETED"
  | "APPROVED"
  | "RUN_STARTED"
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "SHARE_URL_ADDED"
  | "SHARE_URL_DELETED"
  | "NAME_EDITED"
  | "TEAM_MEMBER_INVITED"
  | "TEAM_MEMBER_REMOVED";

/**
 * Input shape for appending an audit log entry. Strictly typed to the
 * `auditActionType` enum and the `AuditDetails` jsonb shape.
 */
export type AuditLogEntryInput = {
  estimateId: string;
  userId: string;
  actionType: AuditActionType;
  details?: AuditDetails;
};

/**
 * Shape of a row returned after insertion (includes server-generated fields).
 */
export type AuditLogEntryRow = {
  id: string;
  estimateId: string;
  userId: string;
  actionType: AuditActionType;
  details: AuditDetails;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Public API — insertion only
// ---------------------------------------------------------------------------

/**
 * Append a single entry to the `estimate_audit_log` table.
 *
 * Returns the inserted row including the server-generated `id` and `createdAt`.
 * This is the ONLY write operation exposed by this module — no updates or
 * deletes are permitted at the application layer.
 */
export async function appendAuditLogEntry(
  db: NodePgDatabase,
  entry: AuditLogEntryInput,
): Promise<AuditLogEntryRow> {
  const [row] = await db
    .insert(estimateAuditLog)
    .values({
      estimateId: entry.estimateId,
      userId: entry.userId,
      actionType: entry.actionType,
      details: entry.details ?? null,
    })
    .returning();

  return {
    id: row.id,
    estimateId: row.estimateId,
    userId: row.userId,
    actionType: row.actionType as AuditActionType,
    details: row.details ?? null,
    createdAt: row.createdAt,
  };
}
