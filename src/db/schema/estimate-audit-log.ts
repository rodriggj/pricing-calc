// Drizzle schema — `estimate_audit_log` table.
//
// Implements the row defined in design §"Data Models — `estimate_audit_log`".
// Append-only at the application layer per D-30.3 — no `update*` / `delete*`
// helpers ship from `src/contract/audit-log.ts`. Physical enforcement via
// `REVOKE UPDATE, DELETE` is a follow-up infra task (out of scope here).

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { auditActionType } from "./enums";
import { estimates } from "./estimates";
import type { AuditDetails } from "./json-types";

export const estimateAuditLog = pgTable(
  "estimate_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    actionType: auditActionType("action_type").notNull(),
    details: jsonb("details").$type<AuditDetails>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    estimateIdx: index("audit_estimate_idx").on(t.estimateId),
    actionIdx: index("audit_action_idx").on(t.actionType),
    createdIdx: index("audit_created_idx").on(t.createdAt),
  }),
);
