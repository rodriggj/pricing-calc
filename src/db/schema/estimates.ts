// Drizzle schema — `estimates` table.
//
// Implements the row defined in design §"Data Models — `estimates`":
//   - Soft delete via `deletedAt` (D-32).
//   - `pinnedArchitectureRevisionId` references `architecture_revisions(id)`
//     (D-06.3). The reference is a thunk so the circular FK between
//     `estimates` and `architecture_revisions` resolves at module-evaluation
//     time. No `onDelete` action is set: the architecture revision survives
//     the estimate so the historical record is preserved alongside the audit
//     log; the design only specifies cascade where it is listed (line items,
//     architecture revisions, share-url revisions, audit log all cascade
//     *from* the estimate).
//   - `runLockHolder` / `runLockExpiresAt` carry the Agent 2 lock columns
//     described in D-10. They are unused in this spec but live on the row so
//     follow-up specs can populate them without a migration.

import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { architectureRevisions } from "./architecture-revisions";
import { estimateStatus } from "./enums";

export const estimates = pgTable(
  "estimates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    orgId: text("org_id"),
    name: text("name").notNull().default("Untitled Estimate"),
    status: estimateStatus("status").notNull().default("DRAFT"),
    yearOneStartMonth: date("year_one_start_month").notNull(),
    pinnedArchitectureRevisionId: uuid(
      "pinned_architecture_revision_id",
    ).references((): AnyPgColumn => architectureRevisions.id),
    runLockHolder: text("run_lock_holder"),
    runLockExpiresAt: timestamp("run_lock_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    ownerIdx: index("estimates_owner_idx").on(t.ownerId),
    orgIdx: index("estimates_org_idx").on(t.orgId),
    statusIdx: index("estimates_status_idx").on(t.status),
  }),
);
