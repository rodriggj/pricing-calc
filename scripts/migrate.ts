/**
 * Programmatic migration runner.
 *
 * drizzle-kit 0.20.x does not expose a CLI `migrate` command. This script uses
 * drizzle-orm's `migrate()` function to apply SQL migrations from `migrations/`
 * against the database specified by `DATABASE_URL`.
 *
 * Usage: pnpm db:migrate
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("Migrations complete.");

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
