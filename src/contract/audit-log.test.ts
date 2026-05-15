import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";

import { appendAuditLogEntry } from "./audit-log";
import type { AuditLogEntryInput } from "./audit-log";
import { estimates } from "../db/schema/estimates";
import { estimateAuditLog } from "../db/schema/estimate-audit-log";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app";

/**
 * Check if the database is reachable. If not, skip the suite gracefully so
 * that `pnpm vitest --run` passes in environments without a running Postgres.
 */
async function isDatabaseReachable(): Promise<boolean> {
  const testPool = new Pool({ connectionString: DATABASE_URL });
  try {
    const client = await testPool.connect();
    client.release();
    return true;
  } catch {
    return false;
  } finally {
    await testPool.end();
  }
}

const canConnect = await isDatabaseReachable();

describe.skipIf(!canConnect)("appendAuditLogEntry", () => {
  let pool: InstanceType<typeof Pool>;
  let db: ReturnType<typeof drizzle>;
  let testEstimateId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool);

    // Insert a test estimate to satisfy the FK constraint on audit log entries.
    const [est] = await db
      .insert(estimates)
      .values({
        ownerId: "test-user-audit",
        orgId: null,
        name: "Audit Log Test Estimate",
        status: "DRAFT",
        yearOneStartMonth: "2024-01-01",
      })
      .returning();

    testEstimateId = est.id;
  });

  afterAll(async () => {
    // Clean up: deleting the estimate cascades to audit log entries.
    if (testEstimateId) {
      await db.delete(estimates).where(eq(estimates.id, testEstimateId));
    }
    await pool.end();
  });

  it("inserts a row and selects it back with matching fields", async () => {
    const input: AuditLogEntryInput = {
      estimateId: testEstimateId,
      userId: "user-abc",
      actionType: "CONTEXT_EDITED",
      details: { field: "description", oldValue: "foo", newValue: "bar" },
    };

    const result = await appendAuditLogEntry(db, input);

    // Verify returned row has generated fields
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe("string");
    expect(result.createdAt).toBeInstanceOf(Date);

    // Verify returned row matches input
    expect(result.estimateId).toBe(input.estimateId);
    expect(result.userId).toBe(input.userId);
    expect(result.actionType).toBe(input.actionType);
    expect(result.details).toEqual(input.details);

    // Select the row back from the database and verify it matches
    const [selected] = await db
      .select()
      .from(estimateAuditLog)
      .where(eq(estimateAuditLog.id, result.id));

    expect(selected).toBeDefined();
    expect(selected.id).toBe(result.id);
    expect(selected.estimateId).toBe(input.estimateId);
    expect(selected.userId).toBe(input.userId);
    expect(selected.actionType).toBe(input.actionType);
    expect(selected.details).toEqual(input.details);
    expect(selected.createdAt).toEqual(result.createdAt);
  });

  it("defaults details to null when not provided", async () => {
    const input: AuditLogEntryInput = {
      estimateId: testEstimateId,
      userId: "user-xyz",
      actionType: "VIEWED",
    };

    const result = await appendAuditLogEntry(db, input);

    expect(result.details).toBeNull();

    // Verify in DB
    const [selected] = await db
      .select()
      .from(estimateAuditLog)
      .where(eq(estimateAuditLog.id, result.id));

    expect(selected.details).toBeNull();
  });
});
