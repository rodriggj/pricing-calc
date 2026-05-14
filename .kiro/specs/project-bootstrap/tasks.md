# Implementation Plan: Project Bootstrap

## Overview

This is the implementation plan for the **Project Bootstrap** Glue spec. It produces a working but empty project skeleton — Next.js 15 + TypeScript + pnpm + Docker Postgres 16 + shadcn-initialized — that the next spec (`.kiro/specs/estimate-format-and-contract/`) builds on top of.

The plan follows the design's Bootstrap Command Sequence (design §"Architecture") one natural seam at a time. Each leaf task corresponds to one of the seven steps in that sequence (or a contiguous group of steps that share a single artifact), in order. The fifth task is the demo-script walkthrough that proves the skeleton works end-to-end and produces the spec's demonstrable outcome.

**Implementation language:** TypeScript (locked by `tech-stack.md` and the design's `--typescript` flag on `create-next-app`).

**Leaf task count:** 5 (per Rule 3 of `spec-decomposition-rules.md` — Glue specs are typically under 5). All tasks are required for the demo to pass; **no optional tasks**.

## Tasks

- [x] 1. Scaffold the Next.js + TypeScript app with pinned versions
  - From the empty repo root, run the exact non-interactive scaffold command from design §3:
    `pnpm create next-app@15.5.9 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --skip-install`
  - Hand-edit `package.json` to tighten the `^X.Y.Z` ranges emitted by `create-next-app` to exact pins per the Pinned Versions table in design §1: `next` → `15.5.9`, `react` → `19.0.0`, `react-dom` → `19.0.0`, `typescript` → `5.7.3`, `eslint-config-next` → `15.5.9`, plus the `tailwindcss` / `@tailwindcss/postcss` / `eslint` defaults tightened to their resolved exact versions at install time. No `^`, no `~`, no `*`, no `latest` for any dependency this spec installs.
  - Hand-edit `package.json` to add `"packageManager": "pnpm@10.5.0"` and `"engines": { "node": ">=22.0.0 <23.0.0" }` per design §2 and §4. Confirm the `scripts` block is exactly `dev` / `build` / `start` / `lint` (the create-next-app default) and that no `db:migrate`, `contract:harness`, or other downstream-owned script is present (FR-2 AC-6).
  - Create `.nvmrc` at the repo root containing the single line `22.14.0` per design §5 (no trailing comments, no surrounding whitespace).
  - Run `pnpm install` and confirm exit code 0; spot-check `pnpm-lock.yaml` to verify the resolved versions match the Pinned Versions table (FR-2 AC-4 / FR-1 AC-3).
  - Run `pnpm build` and confirm exit code 0 (FR-1 AC-5).
  - Verify-only (no edits): open `tsconfig.json` and confirm `compilerOptions.paths` contains `"@/*": ["./src/*"]` per design §6. Confirm the file tree matches design §"Post-Spec File Tree" — `src/app/{layout.tsx,page.tsx,globals.css}` exist and `src/components/ui/`, `src/contract/`, `src/db/`, `drizzle.config.ts`, `vitest.config.ts` do not.
  - _Requirements: FR-1 (AC-1, AC-2, AC-3, AC-5), FR-2 (AC-1, AC-2, AC-3, AC-4, AC-6)_
  - _Design: §1 (Pinned Versions), §2 (Node and pnpm Version Decisions), §3 (create-next-app invocation), §4 (package.json shape), §5 (.nvmrc), §6 (tsconfig.json)_

- [x] 2. Add the local Postgres docker-compose service
  - Author `docker-compose.yml` at the repo root, verbatim from design §7:
    - One service named `postgres` using image `postgres:16-alpine`.
    - Three environment variables: `POSTGRES_USER=estimating_app`, `POSTGRES_PASSWORD=dev_only_password`, `POSTGRES_DB=estimating_app`.
    - `ports: ["5432:5432"]`.
    - Named volume `postgres_data` mounted at `/var/lib/postgresql/data`.
    - Healthcheck using `pg_isready -U estimating_app -d estimating_app` with `interval: 5s`, `timeout: 5s`, `retries: 6` (= 30 seconds total grace per FR-3 AC-6).
    - **No top-level `version:` key** (Compose v2 ignores it — design §7 risk callout #3).
    - Top-level `volumes: { postgres_data: }` block.
  - Run `docker compose up -d` from the repo root and observe `docker compose ps` reporting `healthy` for the `postgres` service within 30 seconds (FR-3 AC-6).
  - Verify connectivity by running `docker exec -i $(docker compose ps -q postgres) psql -U estimating_app -d estimating_app -c "SELECT 1"` and confirming the command returns `1` and exits 0 (FR-3 AC-7).
  - Run `docker compose down` (without `-v`) and re-run `docker compose up -d`; confirm the `postgres_data` volume persists (demo Observe (e) precondition).
  - _Requirements: FR-3 (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7)_
  - _Design: §7 (docker-compose.yml)_

- [x] 3. Wire env-template and gitignore hygiene
  - Author `.env.local.example` at the repo root with the exact single line from design §8: `DATABASE_URL=postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app` (no surrounding quotes, no trailing whitespace, no terminating comment). The connection string matches the credentials in `docker-compose.yml` from Task 2 (FR-4 AC-4).
  - Append the explicit env-file block from design §9 to the existing `.gitignore` (which `create-next-app` populated in Task 1):
    - A small comment header identifying the block as the project-bootstrap addition.
    - Explicit entries `.env.local` and `.env.*.local`.
    - The defensive negation `!.env.local.example` so the example file is always tracked even if a future broader pattern is added.
  - **Do NOT** add `out/`, `fixtures/`, `migrations/`, or `coverage/` to `.gitignore` — those paths are owned by the contract spec's Task 1 (NFR-2 AC-3). Confirm the appended block stays narrow.
  - Verify `.env.local` is ignored by running `git check-ignore .env.local` (or equivalent) and confirming it reports the path as ignored. Verify `.env.local.example` is **not** ignored by running `git check-ignore .env.local.example` and confirming it exits non-zero.
  - Confirm no `.env.local` file is committed in the working tree (FR-4 AC-3).
  - _Requirements: FR-4 (AC-1, AC-2, AC-3, AC-4), NFR-2 (AC-3)_
  - _Design: §8 (.env.local.example), §9 (.gitignore reconciliation)_

- [x] 4. Initialize shadcn/ui (no components added) — hand-authored, no CLI invocation
  - **Approach changed mid-task:** Three `pnpm dlx shadcn init` attempts (`shadcn@2.3.0` with 1.x flags, `shadcn@2.3.0` with `--defaults`, `shadcn@4.7.0` with `--defaults`) all failed for different reasons: stale flags, Tailwind-v3-only preflight, and 4.x auto-scaffolding components in violation of FR-5 AC-3. Per the failure-loop rule, switched to hand-authoring per design §10 (revised). No CLI invocation; the same four artifacts are produced directly.
  - Hand-author `components.json` at the repo root verbatim from design §11 (App Router + src/ + `@/*` alias + `baseColor: neutral` + `cssVariables: true` + `tailwind.css: "src/app/globals.css"`).
  - Hand-author `src/lib/utils.ts` verbatim from design §12 (the `cn` helper using `clsx` and `tailwind-merge`).
  - Add `clsx` and `tailwind-merge` as exact-pinned dependencies in `package.json` per design §1 (`clsx@2.1.1`, `tailwind-merge@3.6.0`).
  - Run `pnpm install` (verify exit 0) and `pnpm build` (verify exit 0) to confirm the cn helper compiles cleanly through Next.js + Tailwind v4.
  - Confirm `package.json` has NO `@radix-ui/*` packages (FR-5 AC-3) and NO `shadcn`, `@base-ui/react`, `class-variance-authority`, `tw-animate-css`, or `lucide-react` (the boundary-violating runtime deps the 4.x `init` would have pulled in). Confirm `src/components/` and `src/components/ui/` do NOT exist on disk — `shadcn add <name>` (a future-spec concern) is the only path that should ever create them.
  - _Requirements: FR-5 (AC-1, AC-2, AC-3)_
  - _Design: §10 (hand-authoring rationale + pin history), §11 (components.json), §12 (src/lib/utils.ts)_

- [x] 5. Demo-script verification
  - Walk through every step of the demo script in `requirements.md` against the now-implemented skeleton on a fresh checkout, in order:
    - Steps 1–4: `pnpm install`, `docker compose up -d`, `docker compose ps` shows `postgres` healthy (Observe a).
    - Steps 5–6: `cp .env.local.example .env.local`, then the `docker exec ... psql -c "SELECT 1"` returns `1` (Observe b).
    - Step 7: `pnpm dev` prints `Local: http://localhost:3000` within ~10 seconds and the browser shows the default Next.js landing page (Observe c).
    - Step 8: `pnpm build` exits 0 (Observe d).
    - Step 9: `docker compose down` removes the container while `postgres_data` persists (Observe e).
  - Cross-check every Confirm step (a–e) against its mapped design section per the design's "Demo Step → Design Element Mapping" table:
    - Confirm a (`package.json` shape) → design §4.
    - Confirm b (`.gitignore` env block) → design §9.
    - Confirm c (`docker-compose.yml`) → design §7.
    - Confirm d (`components.json`) → design §11.
    - Confirm e (absent paths) → design §"Architecture / Post-Spec File Tree".
  - Confirm the boundary with the contract spec one final time: every directory listed as **MUST NOT EXIST** in design §"Architecture / Post-Spec File Tree" is absent (`src/contract/`, `src/db/`, `fixtures/`, `out/`, `src/components/ui/`, `drizzle.config.ts`, `vitest.config.ts`, `scripts/contract-harness.ts`); every dependency listed as forbidden in NFR-2 AC-1 is absent from `package.json` (`drizzle-orm`, `drizzle-kit`, `zod`, `fast-check`, `vitest`).
  - File `docs/project-bootstrap-demo-run.md` capturing the actual stdout from one successful end-to-end walkthrough (the `pnpm install` summary, the `docker compose ps` health row, the `psql "SELECT 1"` output, the `Local: http://localhost:3000` line, the `pnpm build` exit, and the `docker compose down` output) so future reviewers have a reference run to compare against. This file is the spec's demonstrable outcome (Rule 2) and the runnable demo script (Rule 8).
  - This task introduces no new code beyond `docs/project-bootstrap-demo-run.md`. If any step fails, the failure is fixed in the prior task that owns it (e.g., a healthcheck timing miss is fixed in Task 2; a missing `cn` helper in Task 4) and Task 5 is re-run from a clean state.
  - _Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, NFR-1, NFR-2_
  - _Design: §"Demo Step → Design Element Mapping", §"Architecture / Post-Spec File Tree", §"Acceptance Criteria → Design Element Mapping"_

## Notes

- **Leaf count: 5.** Aligned with Rule 3's Glue-spec guidance ("usually under 5 tasks") and well under Rule 1's hard ceiling of 15. One leaf per natural seam in the design's Bootstrap Command Sequence: scaffold (steps 1–3 of the sequence), compose (step 4), env+gitignore (steps 5–6), shadcn (step 7), demo-walkthrough.
- **No optional tasks.** Every task is required for the demo script to pass. None are postfixed with `*`.
- **PBT deferral re-affirmed.** Per Rule 6's "invariant is trivially true by construction" allowance, this spec ships no property-based tests. The deferral is documented in `requirements.md` ("Property-Based Testing — Documented Deferral") and re-stated in `design.md` ("Testing Strategy / PBT Deferral"). PBT machinery (`fast-check`, `vitest`) is installed by `.kiro/specs/estimate-format-and-contract/` Task 1, not here.
- **Boundary with the contract spec.** Drizzle, Zod, fast-check, and Vitest installation; `drizzle.config.ts`, `vitest.config.ts`, `scripts/contract-harness.ts`; `src/contract/`, `src/db/`, `fixtures/`, `out/`; and the `out/` / `migrations/` `.gitignore` entries are **all owned by `.kiro/specs/estimate-format-and-contract/` Task 1**, not by this spec. Verified by Task 5's Confirm-a / Confirm-e steps.
- **Demo verification (Task 5)** is the demonstrable outcome required by Rule 2 and the demo script required by Rule 8, mirroring how the contract spec's Task 15 captures `docs/contract-demo-run.md`. `docs/project-bootstrap-demo-run.md` is the artifact of record; if any walkthrough step fails, the fix lives in the task that owns the failing artifact (compose service → Task 2, gitignore entry → Task 3, etc.) and Task 5 is re-executed.

## Workflow Status

This is the **planning phase only**. No implementation work begins until the user approves this task list. Once approved, tasks are executed individually by opening this file and clicking "Start task" next to a task item.
