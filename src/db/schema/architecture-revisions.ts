// Drizzle schema — `architecture_revisions` table.
//
// Implements the row defined in design §"Data Models — `architecture_revisions`".
// Append-only by convention: no update/delete API surface ships in this spec.
// The `estimates.pinnedArchitectureRevisionId` foreign key is what locks a
// revision in at finalize time (D-06.3); cascade-on-delete from the parent
// estimate cleans up unpinned revisions when an estimate is hard-deleted.

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { estimates } from "./estimates";
import type { PromptMeta } from "./json-types";

export const architectureRevisions = pgTable(
  "architecture_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    mermaidSource: text("mermaid_source").notNull(),
    agentCommentary: text("agent_commentary"),
    generationReason: text("generation_reason").notNull(),
    promptMetadata: jsonb("prompt_metadata").$type<PromptMeta>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    estimateIdx: index("arch_revisions_estimate_idx").on(t.estimateId),
  }),
);
