# Implementation Plan: Estimate Format & Contract

## Overview

This is the implementation plan for the **Estimate Format & Contract** Horizontal Foundation spec. It produces:

- A Drizzle schema for the five contract tables and a runnable migration.
- Zod validators for the wire payload, line items, and projection output.
- A pure projection function from per-resource form to per-year-group form.
- Two deterministic Markdown renderers (`estimate.md`, `architecture.md`).
- A `fast-check` v3.x property-based test suite covering 11 of 12 design invariants (I-11 is a documented structural check, not a value-based PBT — see Task 13).
- A runnable test harness (`pnpm contract:harness`) that exercises fixtures end-to-end, runs the PBT suite, and emits observable artifacts to `out/`.

The final demo (Task 15) is a walk-through of the demo script in `requirements.md` — fixture validation, projection, rendering, determinism, negative Zod case, and PBT seed reproducibility.

**Implementation language:** TypeScript (locked by `tech-stack.md` and the design's TypeScript-typed interfaces).

**Leaf task count:** 15 (at Rule 1 ceiling). All tasks are required for v1; no optional tasks.

**Sub-bullet convention:** Indented bullets without checkboxes are descriptive scope notes that help reviewers understand each leaf task. They do **not** count as additional leaf tasks. Task 12 in particular groups all PBT properties under one leaf because they share generator infrastructure (per the spec instruction allowing multiple properties per leaf when infrastructure is shared).

## Tasks

- [x] 1. Project scaffolding and dependency pinning
  - Create the contract package directory layout: `src/contract/` (with `index.ts`, `schema.ts`, `projection.ts`, `markdown.ts`, `state-machine.ts`, `audit-log.ts`, `errors.ts`, `versions.ts`) and `src/db/schema/` (with one file per table plus a barrel `index.ts`).
  - Create `scripts/contract-harness.ts` entry point (skeleton only; implementation lands in Task 13).
  - Create `fixtures/sample-estimates/` and `out/` directories; add `out/` to `.gitignore`.
  - Set up `drizzle.config.ts` pointing at `src/db/schema/` with `migrations/` as the output directory.
  - Add a `vitest.config.ts` that picks up `src/**/*.test.ts` and the harness fixtures.
  - Wire `package.json` scripts: `db:migrate` (drizzle-kit migrate), `contract:harness`, `contract:harness:pbt-only`, and a typed pass-through for `contract:harness --fixture <path>`.
  - Pin every dependency to a specific minor version per the design's Dependencies table: `drizzle-orm` ^0.29.x, `drizzle-kit` matching minor, `zod` ^3.22.x, `fast-check` ^3.15.x, `vitest` ^1.x. No open ranges.
  - _Requirements: FR-6, NFR-1, NFR-2_
  - _Design: §"Components and Interfaces", §"Dependencies"_

- [x] 2. Drizzle schema for all five contract tables
  - Define `estimateStatus`, `lineItemStatus`, and `auditActionType` Postgres enums with the exact member sets from D-11 v1 and D-30.3 (no `STALE`, no `SKIPPED`, no `UPDATED`).
  - Define the `estimates` table with the columns, defaults, and indexes from the design's Data Models section, including `deletedAt` (soft delete per D-32) and the `pinnedArchitectureRevisionId` foreign key.
  - Define the `lineItems` table with `quantityPerYear` typed as `[number, number, number, number, number]` jsonb, `region` defaulting to `'us-east-1'`, and the `(region = 'us-east-1')` CHECK constraint expressed inline so drizzle-kit emits it.
  - Define the `architectureRevisions` table (append-only by convention; no update/delete API surface).
  - Define the `shareUrlRevisions` table with `deletedAt` soft delete and the partial unique index `share_revisions_first_pass_unique` on `(estimate_id) WHERE is_first_pass = true AND deleted_at IS NULL` (per D-22).
  - Define the `estimateAuditLog` table with the action-type, estimate-id, and created-at indexes.
  - Export `InferSelectModel` row types for every table from `src/db/schema/index.ts`.
  - _Requirements: FR-1 (AC-1, AC-2, AC-3, AC-4), INV-1 (AC-1)_
  - _Design: §"Drizzle Schema Module", §"Data Models", §"Postgres Enums"_

- [x] 3. Generate and verify the initial migration
  - Run `pnpm drizzle-kit generate` to produce the SQL migration in `migrations/`. Commit the generated SQL.
  - Hand-inspect the generated SQL to confirm it includes the partial unique index (with the `WHERE` clause), the region CHECK constraint, the three enums, and all foreign keys with `ON DELETE CASCADE` where the design specifies.
  - Run `pnpm db:migrate` against an empty Postgres instance and confirm exit code 0.
  - Run `pnpm db:migrate` a second time against the same database and confirm it detects no pending changes and exits 0 (idempotency).
  - Add a brief `migrations/README.md` documenting how to point the migrator at a connection string via `.env`.
  - _Requirements: FR-1 (AC-5, AC-6)_
  - _Design: §"Drizzle Schema Module"_

- [x] 4. Zod validators and cross-field refinements
  - Implement `LineItemSchema` enforcing the exact-five-non-negative-integers tuple, the `'us-east-1'` literal region, and the service-code allow-list from D-08.
  - Implement `EstimatePayloadSchema` composing `LineItemSchema`, validating the `YYYY-MM-01` first-of-month form for `yearOneStartMonth`, validating `status` as the v1 enum, and adding the cross-field refinement that requires `pinnedArchitectureRevisionId` to be non-null whenever `status` is in `{AWAITING_APPROVAL, APPROVED, QUEUED, IN_PROGRESS, COMPLETE, PARTIALLY_COMPLETE, FAILED}`.
  - Implement `PerYearGroupPayloadSchema` mirroring the projection output type (5-tuple of `YearGroup`s).
  - Implement `ShareUrlRevisionSchema` (URL regex check on the `calculator.aws/#/estimate?id=...` shape).
  - Implement `parseEstimatePayload(input: unknown): EstimatePayload` (throws `ZodError` with structured paths) and `safeParseEstimatePayload(input: unknown): SafeParseReturnType<...>`. The parser returns a fresh deep clone (no aliasing with input).
  - Add a `ContractInvariantError` class in `src/contract/errors.ts` for the renderer's pinned-architecture mismatch case (used by Task 7).
  - Add unit tests covering each negative case enumerated in FR-2 AC-2 through AC-6 (length≠5 quantity, non-`us-east-1` region, invalid status, malformed `yearOneStartMonth`, post-DRAFT status with null pinned-id) and the happy-path AC-7.
  - _Requirements: FR-2 (AC-1 through AC-8), INV-2 (AC-1), INV-4 (AC-1), INV-12 (AC-1), NFR-3_
  - _Design: §"Zod Validators", §"Wire payload"_

- [x] 5. Projection function
  - Implement `projectToPerYearGroups(payload: EstimatePayload): PerYearGroupPayload` per Algorithm 1 in the design. Pure, no input mutation, deterministic ordering by `lineItemId` ascending within each group.
  - Compute year-start months by adding `(yearIndex − 1) × 12` calendar months to `payload.yearOneStartMonth` (no timezone arithmetic; treat the date as a calendar date).
  - Omit zero-quantity items entirely; carry the line item's `configuration` forward unchanged into every year group it appears in.
  - Add unit tests using the three fixtures from Task 11 once available; for now, add inline fixture objects covering: a flat-quantity case, a sparse case (some zero years), and an all-years-zero case (verifies omission).
  - Verify the postcondition `Σ groups[k].items[i].quantity == Σ lineItems[j].quantityPerYear[k] (where qpy[k]>0)` in unit tests against the inline fixtures.
  - _Requirements: FR-3 (AC-1 through AC-7)_
  - _Design: §"Projection Function", §"Algorithm 1"_

- [x] 6. Estimate Markdown renderer
  - Implement `renderEstimateMd(payload: EstimatePayload): string` per Algorithm 2. Total: never throws on validated input. Deterministic: byte-identical output for byte-identical input modulo the metadata block, which itself is constant given pinned `CONTRACT_SCHEMA_VERSION` and `RENDERER_VERSION`.
  - Implement a deterministic `formatConfig` helper (sorted keys, stable separators) that escapes Markdown table-cell special characters in user-supplied strings.
  - Emit one `## Year N — starting <Month YYYY>` section per year; emit `_No resources in this year._` placeholder when the group is empty; emit a Markdown table with `Service | Configuration | Quantity` columns when non-empty.
  - Emit a single trailing HTML-comment metadata block `<!-- contract-metadata schemaVersion: ... rendererVersion: ... -->`. No other renderer-time data anywhere else in the output.
  - Add Vitest snapshot tests against the three fixtures (Task 11). Snapshots are checked into the repo as the canonical Markdown output.
  - _Requirements: FR-4 (AC-1 through AC-8)_
  - _Design: §"Markdown Renderers", §"Algorithm 2"_

- [x] 7. Architecture Markdown renderer
  - Implement `renderArchitectureMd(payload: EstimatePayload, archRev: ArchitectureRevision): string` per Algorithm 3.
  - Throw `ContractInvariantError` (from Task 4) when `archRev.id !== payload.pinnedArchitectureRevisionId`, with a message identifying the mismatch.
  - Emit a fenced ``` ```mermaid ``` block whose body is exactly `archRev.mermaidSource`. Emit a `## Commentary` section iff `agentCommentary` is non-empty.
  - Emit the metadata block at the end with `schemaVersion`, `rendererVersion`, and `architectureRevisionId`.
  - Add Vitest snapshot tests against the three fixtures' architecture revisions, plus a unit test confirming the mismatch throws `ContractInvariantError`.
  - _Requirements: FR-5 (AC-1 through AC-6)_
  - _Design: §"Markdown Renderers", §"Algorithm 3"_

- [x] 8. Estimate status state machine
  - Implement `isLegalEstimateStatusTransition(from: EstimateStatus, to: EstimateStatus): boolean` from a transition table that exactly mirrors the v1 state machine diagram (no `STALE`).
  - Encode the transitions as a `readonly` map of `EstimateStatus` to `ReadonlyArray<EstimateStatus>` so every legal edge is enumerable; include the `[*] → DRAFT` initial transition by convention.
  - Add unit tests enumerating every legal transition (asserts true) and a sample of illegal transitions (e.g., `DRAFT → COMPLETE`, `COMPLETE → DRAFT`) — exhaustive enumeration over the cross-product is left to the I-8 PBT in Task 12.
  - Re-export the predicate and the transition table from `src/contract/state-machine.ts`.
  - _Requirements: INV-8 (AC-1)_
  - _Design: §"Status State Machine"_

- [x] 9. Audit log append-only helper
  - Implement `appendAuditLogEntry(db, entry)` in `src/contract/audit-log.ts`. Insertion-only API surface; no `update*` and no `delete*` exports.
  - Type the entry input strictly to the `auditActionType` enum and the `AuditDetails` jsonb shape.
  - Add a unit test that inserts a row and selects it back; verify the row matches.
  - Document in the file's header comment that this module exists to enforce the application-layer append-only invariant (I-11). The harness's structural check (Task 13) verifies the surface stays clean.
  - _Requirements: INV-11 (AC-1)_
  - _Design: §"Data Models — `estimate_audit_log`"_

- [x] 10. Contract module index and version constants
  - In `src/contract/index.ts`, re-export every public symbol from Tasks 4 (`EstimatePayloadSchema`, `LineItemSchema`, `PerYearGroupPayloadSchema`, `ShareUrlRevisionSchema`, `parseEstimatePayload`, `safeParseEstimatePayload`, `ContractInvariantError`), 5 (`projectToPerYearGroups`), 6 (`renderEstimateMd`), 7 (`renderArchitectureMd`), 8 (`isLegalEstimateStatusTransition`), and 9 (`appendAuditLogEntry`).
  - Re-export the TypeScript types `EstimatePayload`, `LineItem`, `Configuration`, `PerYearGroupPayload`, `YearGroup`, `YearGroupItem`, `ShareUrlRevision`, `ArchitectureRevision`, `EstimateStatus`, `LineItemStatus`, `AuditActionType`.
  - In `src/contract/versions.ts`, declare `export const CONTRACT_SCHEMA_VERSION = 'v1.0.0'` and `export const RENDERER_VERSION = 'v1.0.0'` (or equivalent semantic strings); re-export both from `index.ts`.
  - Add a brief README in `src/contract/` stating that `parseEstimatePayload` is the trust boundary and that no alternate path bypasses validation (NFR-3 documentation requirement).
  - Add a compile-time export check (a tiny test that imports every promised symbol from the index) so removing one is a build break.
  - _Requirements: FR-6 (AC-1, AC-2, AC-3), NFR-3 (AC-1, AC-2)_
  - _Design: §"Components and Interfaces"_

- [x] 11. Canonical fixtures
  - Author `fixtures/sample-estimates/flat-quantity.json` — same quantity across all five years; used to exercise the constant-config invariant and the all-years-non-empty rendering path.
  - Author `fixtures/sample-estimates/three-year-ramp.json` — monotonically increasing quantities (e.g., 1, 2, 3, 4, 5); used as the demo-script reference fixture.
  - Author `fixtures/sample-estimates/sparse.json` — some line items have zero quantity in some years (including at least one year with zero items total) to exercise the empty-group placeholder rendering.
  - Each fixture is valid against `EstimatePayloadSchema` (i.e., includes a non-null `pinnedArchitectureRevisionId` for any non-DRAFT status, has a `YYYY-MM-01` `yearOneStartMonth`, etc.) and ships paired with an inline `architectureRevisions` array so the architecture renderer has a matching revision to draw from.
  - Add a tiny fixture-loader test that runs each fixture through `parseEstimatePayload` and asserts no `ZodError`.
  - _Requirements: FR-Harness (AC-8)_
  - _Design: §"Test Harness Design"_

- [x] 12. Property-based test generators and properties
  - Implement the shared `fast-check` generators in `src/contract/__pbt__/arbitraries.ts`:
    - `arbConfig` — random JSON object with bounded depth and key count.
    - `arbLineItem` — random service code (from D-08 vocabulary), random `arbConfig` configuration, region pinned to `'us-east-1'`, length-5 tuple of non-negative bounded integers, random status from `lineItemStatus`.
    - `arbEstimatePayload` — composes `arbLineItem`s with random UUID, name, anchor month (first-of-month), status, and a matching `pinnedArchitectureRevisionId` whenever status is post-DRAFT (to satisfy I-12 by construction; PBT for I-12 uses a separate generator that injects null cases).
    - `arbStatusTransition` — biased generator that yields legal `(from, to)` pairs ~50% of the time and arbitrary illegal pairs the rest.
    - `arbShareUrlRevisionHistory` — small composition that produces sequences of inserts and soft-deletes against a single estimate id; used to exercise the partial-unique-index invariant.
  - Implement the 11 PBT properties (one per PBT-marked invariant in the design's invariants table; I-11 is structural and lives in the harness — see Task 13). Each property runs at 1024 cases via `fc.assert(prop, { numRuns: 1024, seed: <printed> })`. Each property is annotated in code with a header comment naming the property number and the requirement clause it validates.
    - **Property 1 (INV-1)** — over `arbShareUrlRevisionHistory`: at every observed state, at most one row has `is_first_pass = true AND deleted_at IS NULL` per estimate id.
    - **Property 2 (INV-2)** — over arbitrary objects (a mixture of well-formed and ill-formed quantity arrays via `arbEstimatePayload` extended with mutation injectors): every payload with a length-5 non-negative-int tuple parses; every other payload yields a `ZodError`.
    - **Property 3 (INV-3)** — over `arbEstimatePayload`: for every line item appearing in multiple year groups of the projection, the `configuration` field is deep-equal across those groups.
    - **Property 4 (INV-4)** — over `arbEstimatePayload` extended with a region-injection arbitrary that occasionally swaps `'us-east-1'` for another region: every payload with `region = 'us-east-1'` parses; every other payload yields a `ZodError`.
    - **Property 5 (INV-5)** — over `arbEstimatePayload`: rendering each payload twice through both renderers yields byte-identical strings each time.
    - **Property 6 (INV-6)** — over `arbEstimatePayload`: neither renderer throws on any valid payload.
    - **Property 7 (INV-7)** — over `arbEstimatePayload`: `parseEstimatePayload(JSON.parse(JSON.stringify(p)))` deep-equals `p`.
    - **Property 8 (INV-8)** — over `arbStatusTransition`: `isLegalEstimateStatusTransition(from, to)` returns true exactly when `(from, to)` is an edge of the v1 state machine.
    - **Property 9 (INV-9)** — over `arbEstimatePayload`: sum of `quantity` over all `YearGroupItem`s equals sum of strictly-positive entries of `quantityPerYear` over all line items.
    - **Property 10 (INV-10)** — over `arbEstimatePayload` (with `yearOneStartMonth` randomized): for every `k` in `0..4`, `groups[k].startMonth` equals `yearOneStartMonth + k × 12 calendar months`.
    - **Property 11 (INV-12)** — over a `(status, pinnedArchitectureRevisionId)` pair generator: parse accepts every legal pair and rejects every illegal pair.
  - Configure `fast-check` to print the seed on every run (NFR-5) and on failure to print the failing example in a form that can be passed to `--seed` to reproduce.
  - _Requirements: INV-1, INV-2, INV-3, INV-4, INV-5, INV-6, INV-7, INV-8, INV-9, INV-10, INV-12, NFR-5_
  - _Design: §"Property-Based Testing Approach", §"Correctness Properties (Invariants)"_

- [x] 13. Test harness CLI, fixture wiring, and structural check for I-11
  - Implement `scripts/contract-harness.ts` as a Node script invoked by `pnpm contract:harness`. Use a tiny argparse (e.g., manual `process.argv` slicing) supporting `--pbt-only` and `--fixture <path>`; reject unknown flags.
  - On full run: load every `*.json` under `fixtures/sample-estimates/`, run each through `parseEstimatePayload`, then `projectToPerYearGroups`, then `renderEstimateMd`, then `renderArchitectureMd`, and write `out/<fixture>.projected.json`, `out/<fixture>.estimate.md`, `out/<fixture>.architecture.md` for each. Use canonical JSON formatting (sorted keys, two-space indent) for the projected JSON so determinism is preserved.
  - Run the 11 PBT properties from Task 12 (or only the PBTs when `--pbt-only` is passed). Capture per-property results and the seed used; write `out/pbt-report.json` summarizing counts, durations, and seeds.
  - Implement the **structural check for I-11** inside the harness: import `* as contractModule from '@/contract'`, iterate the exports, and assert that no exported function name matches the regex patterns `^update.*AuditLog`, `^delete.*AuditLog`, or accepts a `WHERE` clause targeting `estimate_audit_log`. Fail the harness if any forbidden export is found.
  - Print the two summary lines exactly as required: `Fixtures: N / N validated, projected, and rendered` and `PBT properties: M / M passed (1024 cases each, seed=<hex>)`. On any failure, print the failure path (and seed for PBT failures) and exit non-zero.
  - On the negative path (e.g., a fixture fails Zod validation), serialize the `ZodError` issue list with paths and exit non-zero. This satisfies the demo script's negative-case step.
  - _Requirements: FR-Harness (AC-1 through AC-7), INV-11 (AC-1, AC-2), NFR-3, NFR-5_
  - _Design: §"Test Harness Design", §"Component 5: Test Harness"_

- [x] 14. Determinism check and performance timing
  - Add a `pnpm contract:harness:verify-determinism` script that runs the harness twice in succession (against a clean `out/` each time, with the same fixture set) and asserts the diff of `out/` between the two runs is empty. Exits non-zero on any byte difference. This satisfies FR-Harness AC-6 at the harness level and complements the Property 5 PBT (which checks renderer-only determinism over generated payloads).
  - Add lightweight timing instrumentation around `parseEstimatePayload`, `projectToPerYearGroups`, `renderEstimateMd`, and `renderArchitectureMd` in the harness; emit per-call durations into `out/pbt-report.json` under a `timings` key. Assert that no call exceeds 100 ms on a 100-line-item fixture (NFR-4 AC-1) and that the full PBT suite completes in under 60 seconds (NFR-4 AC-2).
  - Document the developer reference machine (CPU, RAM, Node version) in `out/pbt-report.json` so the timing assertions are interpretable across environments.
  - _Requirements: FR-Harness (AC-6), NFR-4 (AC-1, AC-2), INV-5_
  - _Design: §"Performance Considerations", §"Test Harness Design"_

- [x] 15. Demo script verification
  - Walk through every step of the demo script in `requirements.md` against a fresh checkout and confirm each observable matches the spec exactly:
    - Step 1–4: `pnpm install` succeeds, `pnpm db:migrate` is idempotent, `pnpm contract:harness` exits 0.
    - Observe a: stdout shows `Fixtures: 3 / 3 validated, projected, and rendered` and `PBT properties: 11 / 11 passed (1024 cases each, seed=<hex>)`.
    - Observe b: `out/` contains `<fixture>.projected.json`, `<fixture>.estimate.md`, `<fixture>.architecture.md` per fixture, plus `out/pbt-report.json`.
    - Confirm a: open `out/three-year-ramp.estimate.md`, see Year 1–5 sections with tables whose quantities match the fixture's per-year quantities and a metadata block at the bottom.
    - Confirm b: open `out/three-year-ramp.projected.json`, see exactly 5 groups with items present iff `quantityPerYear[k] > 0` in the fixture.
    - Confirm c: open `out/three-year-ramp.architecture.md`, see a fenced ``` ```mermaid ``` block whose body matches the fixture's architecture revision and a Commentary section iff non-empty.
    - Confirm d: re-run the harness; diff `out/` before and after; the diff is empty (uses Task 14's verify-determinism script).
    - Confirm e: edit a fixture so a line item's `quantityPerYear` has 6 elements; re-run; observe the Zod error path and the non-zero exit code.
    - Confirm f: run `pnpm contract:harness --pbt-only`, note the printed seed; re-run with the same seed; observe identical case generation and identical pass/fail outcomes.
  - File a `docs/contract-demo-run.md` capturing the actual stdout from one successful walkthrough so future reviewers have a reference.
  - This task is the spec's demonstrable outcome (Rule 2). It does not introduce new code beyond `docs/contract-demo-run.md`; if a step fails, the failure is fixed in the prior task that owns it (e.g., a Zod path bug is fixed in Task 4) and Task 15 is re-run.
  - _Requirements: FR-Harness, FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, INV-1 through INV-12, NFR-1, NFR-3, NFR-4, NFR-5_
  - _Design: §"Demo Script", §"Test Harness Design"_

## Notes

- **Leaf count: 15.** At Rule 1's ceiling, with no exception requested. If implementation reveals genuinely separable work inside any leaf, the appropriate response is to split the spec, not to expand this task list.
- **No optional tasks.** Every task is required for v1; testing is not optional in a Foundation spec.
- **PBT coverage:** 11 of 12 design invariants have property-based tests in Task 12; I-11 is a structural check in Task 13 (deferral documented in the design and in `requirements.md`).
- **Trust boundary:** `parseEstimatePayload` is the only path that converts `unknown` to `EstimatePayload`. Tasks 5, 6, 7 all accept `EstimatePayload` (the validated type), so the TypeScript compiler enforces the boundary (NFR-3).
- **Demo verification (Task 15)** is the demonstrable outcome required by Rule 2 and the demo script required by Rule 8. It is implicitly verified by Task 13's harness, but is called out as a separate leaf so the walkthrough is auditable on a clean checkout.

## Workflow Status

This is the **planning phase only**. No implementation work begins until the user approves this task list. Once approved, tasks are executed individually by opening this file and clicking "Start task" next to a task item.
