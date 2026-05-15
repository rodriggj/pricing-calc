// Drizzle schema — `line_items` table.
//
// Implements the row defined in design §"Data Models — `line_items`":
//   - `quantityPerYear` is the length-5 jsonb tuple (D-07.6). The TypeScript
//     `.$type<...>()` annotation is a brand only; runtime length / non-negative
//     enforcement lives in the Zod validator (Task 4) since Postgres does not
//     have a native fixed-size-array jsonb type.
//   - `region` defaults to `'us-east-1'` and is pinned to that literal by a
//     CHECK constraint (D-07.5, D-33). drizzle-orm 0.29.5 exports `check` from
//     `pg-core` and the constraint is expressed inline below so the schema is
//     the authoritative source. Note: drizzle-kit 0.20.18 (the pinned migrator)
//     does NOT emit `check()` builder output into generated SQL — this is a
//     known limitation of drizzle-kit 0.20.x. Task 3 hand-appends the
//     `ALTER TABLE line_items ADD CONSTRAINT ... CHECK (region = 'us-east-1')`
//     statement to the generated migration. When drizzle-kit gains check-
//     emission support, the inline expression here is what a regeneration
//     would emit.
//   - `estimateId` cascades on delete so soft-deleting an estimate at the
//     application layer can later be paired with a hard-delete sweep without
//     leaving orphan line items.

import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { estimates } from "./estimates";
import { lineItemStatus } from "./enums";
import type { Configuration } from "./json-types";

export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    serviceCode: text("service_code").notNull(),
    configuration: jsonb("configuration").$type<Configuration>().notNull(),
    region: text("region").notNull().default("us-east-1"),
    quantityPerYear: jsonb("quantity_per_year")
      .$type<[number, number, number, number, number]>()
      .notNull(),
    status: lineItemStatus("status").notNull().default("PENDING"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    estimateIdx: index("line_items_estimate_idx").on(t.estimateId),
    regionUsEast1: check(
      "line_items_region_us_east_1",
      sql`${t.region} = 'us-east-1'`,
    ),
  }),
);
