/**
 * Drizzle Kit configuration.
 *
 * - `schema` points at the per-table modules + barrel under `src/db/schema/`.
 * - `out` writes generated migration SQL into `migrations/` (committed; see Task 3).
 * - `driver: 'pg'` — Postgres target, matches Neon (`tech-stack.md`).
 *   (drizzle-kit 0.20.x — pinned alongside drizzle-orm 0.29.x — uses the
 *   `driver`/`connectionString` form rather than the newer `dialect`/`url`
 *   form introduced in 0.22+.)
 * - Connection URL is read from `process.env.DATABASE_URL`
 *   (see `.env.local.example`).
 */
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema",
  out: "./migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
