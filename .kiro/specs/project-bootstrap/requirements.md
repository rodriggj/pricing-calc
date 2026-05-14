# Requirements Document: Project Bootstrap

## Introduction

This spec stands up the **bare project skeleton** that every downstream spec in this repository will build on top of. Concretely, it produces:

1. A Next.js + TypeScript application initialized with the App Router and a `src/` directory layout.
2. A `package.json` with `pnpm` declared as the package manager and exact-version pins for the framework dependencies this spec installs (Next.js, React, TypeScript).
3. A `.nvmrc` and `engines` entry locking Node to the latest LTS line.
4. A `docker-compose.yml` that runs Postgres 16 locally with the database name, user, and password prescribed in `docs/postgres-db-strategy.md`.
5. A committed `.env.local.example` with the local `DATABASE_URL`, and a `.gitignore` entry that keeps `.env.local` itself out of the repository.
6. A `shadcn/ui` initialization (`components.json` and the `lib/utils.ts` helper) without installing any individual components.

After this spec lands, a developer can clone the repo, run `pnpm install`, run `docker compose up -d`, run `pnpm dev`, and see the default Next.js landing page at `http://localhost:3000` while a healthy local Postgres is reachable at `postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app`. That is the demonstrable outcome and the entire point of the spec.

This spec deliberately does **not** install Drizzle, Zod, fast-check, or Vitest, and does **not** create the `src/contract/` or `src/db/schema/` directories. Those are owned by **Task 1 of `.kiro/specs/estimate-format-and-contract/`**, which assumes — and now will get — a working app skeleton to run against. See "Out of Scope" below for the full boundary.

## Spec Shape Declaration

**Shape:** Glue (per Rule 3 of `.kiro/steering/spec-decomposition-rules.md`).

**Justification:** This spec adds no functional behavior of its own. It connects two existing artifacts — the empty workspace and the already-approved `estimate-format-and-contract` spec — by producing the configuration files and skeleton each side has been assuming. Per Rule 3, Glue specs are typically under five leaf tasks; this spec is sized accordingly. There is no test harness because there is no value-domain logic to exercise; the Glue is verified by the demo script reaching observable states (per Rule 8).

**Pre-decomposition note:** `docs/postgres-db-strategy.md` recommends running this scaffolding work as "a separate quick pass so Task 1 starts against a working app skeleton." This spec is that pass, in spec form.

## Glossary

The following terms name concrete deliverables and are used in EARS-style acceptance criteria.

- **App_Skeleton**: The Next.js + TypeScript project produced by `pnpm create next-app`, configured with the App Router, the `src/` directory layout, and Tailwind CSS as defaulted by `create-next-app`. The application has no business logic of its own beyond the framework's default landing page.
- **Package_Manifest**: The repository's `package.json`.
- **Node_Version_File**: The repository's `.nvmrc`.
- **Compose_File**: The repository's `docker-compose.yml`.
- **Local_Postgres**: The Postgres 16 service defined in `Compose_File`, named `postgres`, exposing port 5432 on the host with a named volume `postgres_data` for data persistence.
- **Env_Template**: The committed file `.env.local.example` containing the local `DATABASE_URL` line.
- **Git_Ignore**: The repository's `.gitignore`.
- **Shadcn_Init**: The state produced by `pnpm dlx shadcn@latest init`: a `components.json` file at the repo root and a `src/lib/utils.ts` helper, with no individual components added.
- **Pinned_Version**: A version specifier in `Package_Manifest` that resolves to exactly one published release (no `^`, no `~`, no `*`, no `latest`) for dependencies this spec owns.
- **Local_Connection_String**: The literal string `postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app`, prescribed by `docs/postgres-db-strategy.md` and used as the value of `DATABASE_URL` in `Env_Template`.

## Stakeholder Needs

This is a Glue spec. Its "users" are the developer running the demo and the downstream specs that consume the skeleton it produces. Stakeholder needs are framed accordingly per Rule 4.

### Stakeholder 1: Developer Running the Estimate Format & Contract Spec

> **As the developer about to start Task 1 of `.kiro/specs/estimate-format-and-contract/`, I want a Next.js app skeleton with `pnpm` already installed, a local Postgres reachable on port 5432, and an `.env.local.example` to copy from, so that the contract spec's first task does not have to re-do project initialization and can install Drizzle/Zod/Vitest/fast-check into a working project.**

### Stakeholder 2: New Team Member Setting Up Locally

> **As a new team member with a fresh checkout, I want the README-equivalent artifacts (`docker-compose.yml`, `.env.local.example`, `.nvmrc`, `package.json` with `packageManager` declared) to be present and consistent, so that I can boot the app and database without verbal hand-holding.**

### Stakeholder 3: Spec Reviewer

> **As the spec reviewer, I want a demo script that proves the skeleton actually works end-to-end (dev server reachable, database reachable, environment template loadable), so that I can sign off on this spec on the strength of an observable demonstration rather than file-presence checks.**

## Functional Requirements

### Requirement FR-1: Next.js + TypeScript App Skeleton

**User Story:** As the Developer Running the Estimate Format & Contract Spec, I want a working Next.js application with TypeScript and the App Router, so that the contract spec can place its `src/contract/` and `src/db/schema/` modules into a project that already builds and runs.

**Source:** `.kiro/steering/tech-stack.md` ("Frontend framework: Next.js with App Router; Language: TypeScript"); user prompt requirement that the skeleton be a `pnpm create next-app` output with App Router and a `src/` directory.

#### Acceptance Criteria

1. THE App_Skeleton SHALL include a Next.js application generated with the App Router enabled and the `src/` directory layout, with `app/`, `app/layout.tsx`, and `app/page.tsx` placed under `src/`.
2. THE App_Skeleton SHALL include a `tsconfig.json` configured for TypeScript with the path alias `@/*` resolving to `src/*`.
3. WHEN a developer runs `pnpm install` from a clean checkout, THE App_Skeleton SHALL install all declared dependencies and exit with code 0.
4. WHEN a developer runs `pnpm dev` after `pnpm install`, THE App_Skeleton SHALL start the Next.js development server on port 3000 and serve the default landing page in response to an HTTP GET on `http://localhost:3000`.
5. WHEN a developer runs `pnpm build`, THE App_Skeleton SHALL produce a production build and exit with code 0.

### Requirement FR-2: Pinned Versions and Tooling Declaration

**User Story:** As the Spec Reviewer, I want every dependency this spec installs to be pinned to an exact version, the package manager to be declared, and the Node version to be locked, so that running `pnpm install` today and a year from now produces the same lockfile and the same behavior.

**Source:** `.kiro/steering/tech-stack.md` ("Versioning & Pinning: Node LTS, Next.js pin to a specific minor version per environment, no open ranges"); user prompt requirement that `pnpm` be pinned via the `packageManager` field.

#### Acceptance Criteria

1. THE Package_Manifest SHALL declare a `packageManager` field whose value names `pnpm` at a Pinned_Version (e.g., `pnpm@9.12.3`, no caret, no tilde).
2. THE Package_Manifest SHALL declare an `engines.node` constraint pinning Node to the active LTS line (Node 20.x at the time of authoring).
3. THE Node_Version_File SHALL exist at the repository root and SHALL contain the same Node major version declared in `engines.node`.
4. THE Package_Manifest SHALL list `next`, `react`, `react-dom`, and `typescript` as Pinned_Version entries with no `^`, `~`, `*`, or `latest` ranges.
5. WHEN the Estimate Format & Contract spec later adds `drizzle-orm`, `drizzle-kit`, `zod`, `fast-check`, and `vitest`, THE Package_Manifest produced by this spec SHALL NOT already contain those entries (so the contract spec owns their pins, with no double-declaration).
6. THE Package_Manifest SHALL define at minimum the scripts `dev`, `build`, and `start` as emitted by `pnpm create next-app`, and SHALL NOT define `db:migrate`, `contract:harness`, or any other script reserved for downstream specs.

### Requirement FR-3: Local Postgres via Docker Compose

**User Story:** As the Developer Running the Estimate Format & Contract Spec, I want a local Postgres 16 instance available on `localhost:5432` with a known database, user, and password, so that `pnpm db:migrate` (added later by the contract spec) has a database to apply migrations against without any cloud setup.

**Source:** `docs/postgres-db-strategy.md` ("Minimal `docker-compose.yml`" section); `.kiro/steering/aws-first-preference.md` (deferral of Neon to a later spec is already accepted in the strategy doc).

#### Acceptance Criteria

1. THE Compose_File SHALL define a service named `postgres` whose image is `postgres:16-alpine`.
2. THE Compose_File SHALL set the service environment variables `POSTGRES_USER=estimating_app`, `POSTGRES_PASSWORD=dev_only_password`, and `POSTGRES_DB=estimating_app`.
3. THE Compose_File SHALL publish container port 5432 to host port 5432.
4. THE Compose_File SHALL declare a named volume `postgres_data` and mount it at `/var/lib/postgresql/data` on the `postgres` service.
5. THE Compose_File SHALL declare a healthcheck on the `postgres` service using `pg_isready -U estimating_app -d estimating_app` so that `docker compose ps` reports a healthy state once the database is ready to accept connections.
6. WHEN a developer runs `docker compose up -d` from a clean checkout, THE Local_Postgres SHALL start and reach a healthy state within 30 seconds, as observed by `docker compose ps` reporting `healthy` for the `postgres` service.
7. WHEN a developer runs `docker exec -i $(docker compose ps -q postgres) psql -U estimating_app -d estimating_app -c "SELECT 1"` against a healthy Local_Postgres, THE Local_Postgres SHALL return the value `1`.

### Requirement FR-4: Environment Template and Secrets Hygiene

**User Story:** As a New Team Member, I want a committed `.env.local.example` to copy from and a guarantee that no real `.env.local` is ever committed, so that I can wire up the app to the local database without leaking dev passwords into git history (and without confusing the dev password with a real secret).

**Source:** `docs/postgres-db-strategy.md` (`.env.local` block); user prompt requirement that the spec ship `.env.local.example`, not `.env.local`.

#### Acceptance Criteria

1. THE Env_Template SHALL exist at the repository root as `.env.local.example` and SHALL contain a single uncommented line `DATABASE_URL=` followed by the Local_Connection_String, with no surrounding quotes.
2. THE Git_Ignore SHALL contain entries that exclude `.env.local`, `.env.*.local`, and any other variant of the local-only environment file from version control, while permitting `.env.local.example` to be tracked.
3. THE App_Skeleton SHALL NOT contain a committed `.env.local` file.
4. WHEN a developer copies `.env.local.example` to `.env.local` after `docker compose up -d`, THE Local_Connection_String in the resulting `.env.local` SHALL be sufficient on its own to connect to Local_Postgres with no further edits required.

### Requirement FR-5: shadcn/ui Initialization

**User Story:** As the Developer Running Future UI Specs, I want shadcn/ui already initialized in the project so that adding the first component is `pnpm dlx shadcn add <name>` without a separate init step, but with no components installed yet so this spec stays small.

**Source:** `.kiro/steering/tech-stack.md` ("UI components: shadcn/ui"); user prompt boundary ("Initialize shadcn but don't add components").

#### Acceptance Criteria

1. THE Shadcn_Init SHALL include a `components.json` file at the repository root configured for the App Router, the `src/` directory layout, and the `@/*` path alias.
2. THE Shadcn_Init SHALL include a `src/lib/utils.ts` file containing the `cn` helper as emitted by `shadcn init`.
3. THE App_Skeleton SHALL NOT include any directory named `src/components/ui/` populated with shadcn components, and THE Package_Manifest SHALL NOT list any `@radix-ui/react-*` or other component-specific dependencies beyond those needed by `cn` itself (e.g., `clsx`, `tailwind-merge`).

## Non-Functional Requirements

### Requirement NFR-1: No New AWS or Production Service Dependencies

**User Story:** As the Spec Reviewer, I want this Glue spec to add no AWS infrastructure and no Neon project, so that the spec can be approved without provisioning anything in any cloud account.

**Source:** `.kiro/steering/aws-first-preference.md`; `docs/postgres-db-strategy.md` (Neon deferral); user prompt out-of-scope list.

#### Acceptance Criteria

1. THE App_Skeleton SHALL NOT include any Terraform module, AWS SDK dependency, or Bedrock client configuration.
2. THE App_Skeleton SHALL NOT include a Neon connection string, Neon SDK dependency, or any other reference to a hosted Postgres provider.
3. WHERE production-grade secrets handling (AWS Secrets Manager, Vercel env wiring) is later required, THE App_Skeleton SHALL defer that work to the spec that introduces a deployed environment.

### Requirement NFR-2: Clear Boundary with the Estimate Format & Contract Spec

**User Story:** As the Spec Reviewer, I want the boundary between this spec and `.kiro/specs/estimate-format-and-contract/` to be unambiguous, so that there is no double-declaration of dependencies, scripts, or directories.

**Source:** User prompt ("Drizzle, Zod, fast-check, Vitest installation belongs to the contract spec's Task 1 — don't duplicate"); `.kiro/specs/estimate-format-and-contract/tasks.md` Task 1 scope.

#### Acceptance Criteria

1. THE Package_Manifest produced by this spec SHALL NOT declare `drizzle-orm`, `drizzle-kit`, `zod`, `fast-check`, or `vitest` as dependencies.
2. THE App_Skeleton SHALL NOT contain a `drizzle.config.ts`, a `vitest.config.ts`, a `scripts/contract-harness.ts`, a `src/contract/` directory, a `src/db/` directory, a `fixtures/` directory, or an `out/` directory.
3. THE Git_Ignore produced by this spec SHALL NOT pre-declare entries for paths owned by the contract spec (e.g., `out/`); the contract spec's Task 1 will add those entries when it adds those paths.

## Property-Based Testing — Documented Deferral

Per Rule 6 of `.kiro/steering/spec-decomposition-rules.md`, property-based tests are mandated by default for any invariant a spec defines.

**Deferral:** This spec defines no value-domain invariants. Its deliverables are configuration artifacts (`package.json`, `docker-compose.yml`, `.env.local.example`, `tsconfig.json`, `components.json`) and a vendor-supplied app skeleton. The "invariants" of those artifacts are structural — does a field exist with a specific value, does a service start, does a port answer — and are verified by the demo script observing each end-to-end state.

**Rationale by Rule 6's allowed deferral categories:** "invariant is trivially true by construction" applies. The relevant invariants here ("the `postgres` service uses image `postgres:16-alpine`", "`.env.local` is gitignored", "Next.js dev server boots") are static facts about the configuration, not properties that vary across inputs. There is no input space over which a `fast-check` generator could meaningfully sample.

**When PBT becomes mandatory again:** The estimate-format-and-contract spec, which is the immediate downstream consumer of this skeleton, mandates PBT for 11 of 12 of its invariants (one structural deferral, documented). PBT infrastructure (`fast-check`, `vitest`) is installed by that spec's Task 1, so this spec is also a precondition for the project ever running its first PBT.

## Out of Scope

This spec is intentionally narrow. The items below are excluded so reviewers do not look for them and downstream specs are not blocked from claiming them.

| Out of Scope                                                                                  | Owning Follow-up Spec                                                | Reason                                                                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Drizzle ORM, `drizzle-kit`, `drizzle.config.ts`, migration generation                          | `.kiro/specs/estimate-format-and-contract/` Tasks 1–3                | Contract spec owns the schema and the migration tooling.                                            |
| Zod, fast-check, Vitest installation and configuration                                         | `.kiro/specs/estimate-format-and-contract/` Task 1                   | Contract spec owns its validators, PBT suite, and unit-test runner setup.                           |
| `src/contract/`, `src/db/schema/`, `scripts/contract-harness.ts`, `fixtures/`, `out/`          | `.kiro/specs/estimate-format-and-contract/` Tasks 1–13               | Those directories are created in the contract spec's Task 1.                                        |
| Clerk authentication, Clerk Organizations setup, sign-in/sign-up routes                        | A future Auth spec (not yet stubbed)                                 | Auth is a separable vertical slice; depending on it would block this Glue.                          |
| Individual shadcn/ui components (Button, Dialog, Form, etc.)                                   | The first UI-feature spec that needs them                            | Components are added on demand. `shadcn init` is in scope; `shadcn add` is not.                     |
| AWS resources (S3 bucket, SQS queue, Lambda, Fargate task, Bedrock client, Secrets Manager)    | The deployment / infrastructure spec (not yet stubbed)               | This spec is local-only per `docs/postgres-db-strategy.md`.                                         |
| Neon account, Neon project, Neon branches, production `DATABASE_URL`                           | The first deployed-environment spec (not yet stubbed)                | Neon is locked for production by `tech-stack.md` D-02 but deferred per `postgres-db-strategy.md`.   |
| CI configuration (GitHub Actions, etc.)                                                        | A future CI spec (not yet stubbed)                                   | CI needs a stable test command, which the contract spec provides; CI itself is the next layer up.   |
| `pgvector` extension                                                                           | The document-parsing spec (not yet stubbed)                          | `postgres-db-strategy.md` says swap to `pgvector/pgvector:pg16` when that spec lands.               |
| Tailwind / PostCSS configuration beyond `create-next-app` defaults                             | n/a                                                                  | The defaults are sufficient for this spec; tuning is left to UI specs.                              |

**No upstream mocks.** Per Rule 4, this Glue spec has no upstream consumer to mock; it is the upstream for the contract spec.

## Demo Script

This script is the demonstrable outcome required by Rule 2 and the demo script required by Rule 8. It is runnable end-to-end by another team member without verbal hand-holding.

```
Prerequisites:
- Docker (or Docker Desktop) installed and running.
- Node 20.x (the LTS line declared in .nvmrc) installed.
- pnpm installed (any version; the repo's packageManager field will pin
  the version for the project).

From a clean state:

1. Clone the repository and check out the branch with this spec implemented.
2. Run: pnpm install
3. Run: docker compose up -d
4. Run: docker compose ps

Observe (a):
- The "postgres" service is listed with status "healthy".

5. Copy the env template:
   cp .env.local.example .env.local
6. Confirm the connection string from the template by running:
   docker exec -i $(docker compose ps -q postgres) \
     psql -U estimating_app -d estimating_app -c "SELECT 1"

Observe (b):
- psql prints a one-row result containing the value 1 and exits with code 0.

7. Start the Next.js dev server:
   pnpm dev

Observe (c):
- The terminal prints a "Local: http://localhost:3000" line within ~10 seconds.
- Visiting http://localhost:3000 in a browser shows the default Next.js
  landing page (the create-next-app starter content).

8. Stop the dev server (Ctrl-C) and run:
   pnpm build

Observe (d):
- The build completes and the process exits with code 0.

Confirm:

a. Open package.json
   - The "packageManager" field names pnpm at an exact version
     (no caret, no tilde, no "latest").
   - The "engines.node" field declares Node 20.x.
   - "next", "react", "react-dom", and "typescript" appear with exact
     version strings (no ^, ~, *, or "latest").
   - Drizzle, Zod, fast-check, and Vitest do NOT appear.

b. Open .gitignore
   - .env.local, .env.*.local are listed.
   - .env.local.example is NOT listed.

c. Open docker-compose.yml
   - The service is named "postgres".
   - The image is "postgres:16-alpine".
   - The environment includes POSTGRES_USER=estimating_app,
     POSTGRES_PASSWORD=dev_only_password, POSTGRES_DB=estimating_app.
   - Port 5432 is published.
   - A named volume "postgres_data" is mounted at
     /var/lib/postgresql/data.
   - A healthcheck using pg_isready is declared.

d. Open components.json
   - It exists at the repository root and is configured for the App Router
     with the "@/*" path alias.

e. Confirm directories that should NOT exist:
   - src/contract/ does not exist.
   - src/db/ does not exist.
   - drizzle.config.ts does not exist.
   - vitest.config.ts does not exist.
   - scripts/contract-harness.ts does not exist.
   - These belong to the estimate-format-and-contract spec's Task 1.

9. Tear down:
   docker compose down

Observe (e):
- The "postgres" container is removed; the "postgres_data" volume persists
  by design (data survives a `down` without `-v`).
```

## Traceability Matrix

| Requirement                                                  | Source                                                                                                | Verified By                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| FR-1 Next.js + TypeScript app skeleton                       | `tech-stack.md` (Frontend / Language); user prompt                                                    | Demo script steps 7, 8 (Observe c, d)                      |
| FR-2 Pinned versions and tooling declaration                 | `tech-stack.md` ("Versioning & Pinning"); user prompt (pnpm via packageManager)                       | Demo script Confirm a                                      |
| FR-3 Local Postgres via docker-compose                       | `docs/postgres-db-strategy.md`                                                                        | Demo script steps 3, 4, 6 (Observe a, b); Confirm c        |
| FR-4 Environment template and secrets hygiene                | `docs/postgres-db-strategy.md`; user prompt                                                           | Demo script step 5; Confirm b                              |
| FR-5 shadcn/ui initialization                                | `tech-stack.md` (UI components); user prompt boundary                                                 | Demo script Confirm d                                      |
| NFR-1 No new AWS or production service dependencies          | `aws-first-preference.md`; `docs/postgres-db-strategy.md` (Neon deferral); user prompt                | Demo script Confirm a (no AWS/Neon deps in package.json)   |
| NFR-2 Clear boundary with Estimate Format & Contract spec    | User prompt; `.kiro/specs/estimate-format-and-contract/tasks.md` Task 1                               | Demo script Confirm a, e                                   |
| PBT deferral (Rule 6, "trivially true by construction")      | `.kiro/steering/spec-decomposition-rules.md` Rule 6                                                   | Section "Property-Based Testing — Documented Deferral"     |

## Pre-Implementation Checklist (per spec-decomposition-rules.md "Review Checklist")

- [x] Leaf task count ≤15 (target: ~5 leaf tasks at the Glue ceiling guidance)
- [x] Shape declared (Glue)
- [x] Demonstrable outcome described (dev server reachable, Postgres healthy, `SELECT 1` returns 1)
- [x] Acceptance criteria are user-observable (every criterion is a file's contents, a command's exit code, or a port's response)
- [x] Foundations have a test harness in tasks (N/A — Glue, not Foundation)
- [x] PBT-mandated invariants have property-based tests or documented deferral (deferral documented; rationale: configuration artifacts have no value-domain input space)
- [x] No TODO-chain dependencies on future specs (every "out of scope" item is owned by an existing spec or by an explicitly named future spec stub category)
- [x] Demo script written and runnable
