// Drizzle schema — `share_url_revisions` table.
//
// Implements the row defined in design §"Data Models — `share_url_revisions`".
// The partial unique index `share_revisions_first_pass_unique` enforces
// invariant I-1 (D-22): at most one active `is_first_pass = true` row per
// estimate. The partial-index `WHERE` clause excludes soft-deleted rows so a
// future re-run path (out of scope in v1 per D-13) can append a new first-pass
// revision after the prior one is soft-deleted.
//
// Note: drizzle-kit 0.20.18 (the pinned migrator) does not emit the `WHERE`
// clause for partial unique indexes — it generates `CREATE UNIQUE INDEX ... ON
// share_url_revisions (estimate_id)` with the predicate dropped. The schema is
// expressed correctly here so the partial-unique semantics are recorded as the
// source of truth; Task 3 hand-edits the generated SQL to restore the
// `WHERE is_first_pass = true AND deleted_at IS NULL` filter.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { estimates } from "./estimates";

export const shareUrlRevisions = pgTable(
  "share_url_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    shareUrl: text("share_url").notNull(),
    isFirstPass: boolean("is_first_pass").notNull().default(false),
    createdBy: text("created_by").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    estimateIdx: index("share_revisions_estimate_idx").on(t.estimateId),
    firstPassUnique: uniqueIndex("share_revisions_first_pass_unique")
      .on(t.estimateId)
      .where(sql`${t.isFirstPass} = true AND ${t.deletedAt} IS NULL`),
  }),
);
