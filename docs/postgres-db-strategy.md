# Postgres Database Strategy

This document captures the database-hosting strategy for v1: which Postgres lives where, why, and what to set up before the first spec lands its migration.

> Source decisions: D-02 (Neon as production datastore), D-33 (single-region us-east-1 for v1), `tech-stack.md`. This doc operationalizes those for local development and CI.

## Summary

| Environment | Provider | Reason |
|---|---|---|
| Local development | Postgres 16 in Docker | Fast iteration, free, offline-capable, CI-equivalent |
| CI | Postgres 16 service container in the runner | Same image as local; ephemeral per build |
| Per-PR preview | Neon branch | Branching makes preview environments cheap |
| Staging | Neon branch | Production-equivalent without prod data |
| Production | Neon (us-east-1) | Locked by D-02 / `tech-stack.md` |

Both speak Postgres 16 with `pgvector`. Drizzle migrations are identical across environments. Switching between them is a `DATABASE_URL` change.

## The Two Options Considered

### Option A: Local Postgres in Docker

For development, CI, and harness verification (Task 3 of the Estimate Format & Contract spec).

### Option B: Neon for shared and deployed environments

For per-PR previews, staging, and production. `tech-stack.md` already locks Neon as the production database (D-02).

These are not mutually exclusive. The recommendation is to use both, in that order: local for fast iteration, Neon as soon as the schema stabilizes.

## Why Local Docker First

For the Estimate Format & Contract spec, the immediate workload is:

- Generating Drizzle migrations and rerunning them dozens of times as the schema evolves
- Running the harness and PBT suite locally on every schema change
- Running the determinism check (Task 14), which wipes `out/` between runs
- Running CI eventually, which needs an ephemeral Postgres per build

Local Postgres in Docker takes ~30 seconds to start, costs nothing, has no rate limits, and survives offline work. Neon's free tier is generous but not designed for "spin up a database, blow it away, repeat 50 times today." Branching helps but adds latency and friction during hot iteration.

The harness verifying migrations against a local Docker Postgres is also closer to what CI will look like, which is what Task 3 actually needs to validate.

## Why Neon for Shared and Deployed Environments

Already locked by `tech-stack.md` (D-02). The advantages that matter:

- **Branching.** Every PR can have its own ephemeral Neon branch with the migration applied. Genuinely better than Docker for shared preview environments.
- **Serverless characteristics.** Scales to zero, low maintenance, predictable cost at low volume.
- **pgvector available out of the box.** Relevant when the document parsing spec lands.
- **Aligns with the architecture.** Production deployment already assumes Neon.

## Concrete Proposal for Right Now

Set up the local Docker side now to unblock the Estimate Format & Contract spec's Task 3. Defer Neon account setup until a deployed environment is needed.

### Minimal `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: estimating_app
      POSTGRES_PASSWORD: dev_only_password
      POSTGRES_DB: estimating_app
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
```

### `.env.local`

```
DATABASE_URL=postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app
```

This is enough for Task 3 to verify the migration runs and is idempotent.

### pgvector

Not needed by the Estimate Format & Contract spec, but needed by later specs (document parsing). When that spec lands, swap the local image to `pgvector/pgvector:pg16` — a drop-in replacement that includes the extension. No changes needed today.

## Implications for the Estimate Format & Contract Spec

These are notational refinements, not scope changes:

1. **Task 1 (scaffolding)** should produce `docker-compose.yml` and `.env.local.example` as part of its artifacts. Already in scope under "scaffolding"; no new leaf task.
2. **Task 3 (migration)** should explicitly require `docker compose up -d` before `pnpm db:migrate`. Implicit today; making it explicit prevents confusion when running the demo script for the first time.
3. **Demo script in `requirements.md`** should add a prerequisites line: "Docker running, `docker compose up -d` started."

These can be applied as small edits before Task 1 starts, or rolled in during Task 1.

## Recommended Setup Sequence

In order:

1. **Decide which session implementation runs in.** Spec authoring has produced a long conversation; the spec docs and steering docs are durable. A fresh session is recommended for Task 1.
2. **Pre-step before Task 1: Next.js app scaffolding.** The current workspace has spec docs but no app code. Either treat this as part of Task 1, or do a quick separate scaffolding pass first:
   - `pnpm create next-app`
   - Install pinned versions of Drizzle, Zod, Vitest, fast-check per `tech-stack.md`
   - Drop in `docker-compose.yml` and `.env.local.example`
   Lean toward a separate quick pass so Task 1 starts against a working app skeleton.
3. **Then run Task 1.** From a fresh session, with the local Postgres ready to receive migrations.

## Future: When to Provision Neon

Trigger conditions for setting up Neon:

- The first PR that needs a preview environment a reviewer can click through
- The first time staging is needed (likely when Estimate Authoring Workbench is mid-implementation)
- Before any production deployment

When Neon is provisioned:

- One Neon project, with branches per environment (`main`, `staging`, `preview-<pr>`)
- `DATABASE_URL` for each environment lives in AWS Secrets Manager (per D-20)
- Local development continues to use Docker — Neon is for shared/deployed environments only
- Migrations run against Neon via the same `pnpm db:migrate` pointed at the right `DATABASE_URL`
