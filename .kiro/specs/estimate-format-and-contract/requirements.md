# Requirements Document: Estimate Format & Contract

## Introduction

This spec defines the **structured payload that flows from Agent 1 to Agent 2**, plus the **Markdown projections** rendered from that payload, and the **runnable test harness** that exercises the whole contract end-to-end. It is the seam that lets the conversational authoring half (Estimate Authoring Workbench, Agent 1) and the deterministic execution half (Pricing Calculator Automation, Agent 2) be built in parallel.

Concretely, this spec produces:

1. A **Drizzle schema** for five tables — `estimates`, `line_items`, `share_url_revisions`, `architecture_revisions`, `estimate_audit_log` — exported as TypeScript modules and as Drizzle Kit migration SQL (per D-02, D-22, D-30.3).
2. A set of **Zod validators** for the wire payload, line items, and projection output (per D-01, D-07.5, D-07.6).
3. A pure **projection function** that reshapes the per-resource year-array form into per-year-group form (per D-07.6).
4. Two **Markdown renderers** — `renderEstimateMd` and `renderArchitectureMd` — that produce the two output files Screen 3 generates (per D-01, D-06.1).
5. A **property-based test suite** built on `fast-check` v3.x covering every PBT-marked invariant in the design (per Rule 6 of `spec-decomposition-rules.md`).
6. A **runnable test harness** (`pnpm contract:harness`) that exercises fixtures, projection, renderers, and PBTs and emits observable artifacts (per Rule 3 and Rule 8).

The contract is consumed by every downstream spec (Workbench, Agent 2, Cost Capture, Output / Version Control). Without it, those specs are paralyzed — which justifies the Horizontal Foundation shape.

## Spec Shape Declaration

**Shape:** Horizontal Foundation (per Rule 3 of `.kiro/steering/spec-decomposition-rules.md`).

**Justification:** This spec produces no user-facing UI. It produces TypeScript library code and a Drizzle migration that downstream specs link against. Per Rule 3, foundation specs require a runnable test harness in their task list; the harness is enumerated as **FR-Harness** below and gates the demo script in Section "Demo Script".

## Glossary

The following terms are referenced as `System` names in EARS-style acceptance criteria. Each term names a concrete deliverable of this spec.

- **Contract_Module**: The umbrella TypeScript package this spec produces, importable by downstream specs as `@/contract`. Comprises the schema, validators, projection function, renderers, and exports.
- **Drizzle_Schema**: The TypeScript module(s) under `src/db/schema/` defining the five tables, their indexes, constraints, and Postgres enums.
- **Migration_Tooling**: `drizzle-kit` invoked via `pnpm db:migrate` against a Postgres instance.
- **Zod_Validators**: The exported Zod schemas (`EstimatePayloadSchema`, `LineItemSchema`, `PerYearGroupPayloadSchema`, `ShareUrlRevisionSchema`) and the parser helpers (`parseEstimatePayload`, `safeParseEstimatePayload`).
- **Projection_Function**: `projectToPerYearGroups(payload)` — a pure function from `EstimatePayload` to `PerYearGroupPayload`.
- **Estimate_Renderer**: `renderEstimateMd(payload)` — produces the `estimate.md` byte string.
- **Architecture_Renderer**: `renderArchitectureMd(payload, archRev)` — produces the `architecture.md` byte string.
- **Test_Harness**: The runnable Node script `scripts/contract-harness.ts` invoked via `pnpm contract:harness`.
- **PBT_Suite**: The `fast-check`-driven property tests that the `Test_Harness` runs.
- **Estimate Payload**: The validated wire-form object defined in the design's "Wire payload" section. Per-resource shape with a length-5 `quantityPerYear` array.
- **Per-Year-Group Payload**: The output of `Projection_Function`. Five groups, one per year, with items that have a single `quantity` field (per D-07.6).
- **Validated Payload**: An `Estimate Payload` that has successfully passed `parseEstimatePayload`.
- **Fixture**: A canonical sample estimate stored in `fixtures/sample-estimates/` and consumed by the `Test_Harness`.
- **Schema Version**: The pinned `CONTRACT_SCHEMA_VERSION` constant exported by `Contract_Module` and embedded in renderer output metadata.
- **Renderer Version**: The pinned `RENDERER_VERSION` constant exported by `Contract_Module` and embedded in renderer output metadata.

## Stakeholder Needs

This is a foundation spec with no end-user persona. The "users" of its outputs are other developers and the spec reviewer who runs the demo. Stakeholder needs are framed accordingly per Rule 4.

### Stakeholder 1: Workbench Developer

> **As the developer building the Estimate Authoring Workbench, I want a single importable `Contract_Module` with schema, validators, and renderers, so that I can persist line items, validate inbound tool calls from Agent 1, and render the two output files at finalize time without reinventing the contract.**

### Stakeholder 2: Agent 2 / Automation Developer

> **As the developer building the Pricing Calculator Automation, I want a stable `Per-Year-Group Payload` produced from a `Validated Payload` by a deterministic projection, so that I can hand each year to a Pricing Calculator group without having to re-derive the shape myself.**

### Stakeholder 3: Spec Reviewer

> **As a spec reviewer or new team member running the project from a clean checkout, I want a single command (`pnpm contract:harness`) that proves the contract holds against canonical fixtures and across many randomized cases, so that I can sign off on the foundation without reading every implementation file.**

### Stakeholder 4: Downstream On-Call Engineer

> **As an on-call engineer triaging an incident involving a stored estimate, I want the rendered `estimate.md` and `architecture.md` to be byte-identical for byte-identical inputs, so that diffs against historical versions are meaningful and not noise from non-deterministic formatting.**

## Functional Requirements

### Requirement FR-1: Drizzle Schema and Migration

**User Story:** As the Workbench Developer, I want a Drizzle schema for the five contract tables that produces a runnable migration, so that I can persist estimates and line items in Neon without designing the schema myself.

**Source:** Design §"Drizzle Schema Module" and §"Data Models"; D-02, D-22, D-30.3.

#### Acceptance Criteria

1. THE Drizzle_Schema SHALL export TypeScript table definitions for `estimates`, `line_items`, `share_url_revisions`, `architecture_revisions`, and `estimate_audit_log` with the columns, types, defaults, and indexes specified in the design's "Data Models" section.
2. THE Drizzle_Schema SHALL export Postgres enum definitions for `estimate_status`, `line_item_status`, and `audit_action_type` whose member sets exactly match D-11 v1 and D-30.3.
3. THE Drizzle_Schema SHALL declare a partial unique index on `share_url_revisions(estimate_id) WHERE is_first_pass = true AND deleted_at IS NULL` (per D-22).
4. THE Drizzle_Schema SHALL declare a CHECK constraint on `line_items.region` enforcing `region = 'us-east-1'` (per D-07.5, D-33).
5. WHEN a developer runs `pnpm db:migrate` against an empty Postgres database, THE Migration_Tooling SHALL apply the generated SQL and exit with code 0.
6. WHEN a developer runs `pnpm db:migrate` a second time against the same database, THE Migration_Tooling SHALL detect no pending changes and exit with code 0 (idempotent migration).

### Requirement FR-2: Zod Validators

**User Story:** As the Workbench Developer, I want Zod validators that enforce every payload-level invariant of the contract, so that any HTTP boundary or test harness can reject malformed payloads with a structured error before they reach the database.

**Source:** Design §"Zod Validators" and §"Wire payload"; D-01, D-07.5, D-07.6.

#### Acceptance Criteria

1. THE Zod_Validators SHALL export `EstimatePayloadSchema`, `LineItemSchema`, `PerYearGroupPayloadSchema`, and `ShareUrlRevisionSchema`.
2. WHEN `parseEstimatePayload` is invoked with a value whose `quantityPerYear` is not a tuple of exactly five non-negative integers on at least one line item, THE Zod_Validators SHALL throw a `ZodError` whose path identifies the offending line item and field.
3. WHEN `parseEstimatePayload` is invoked with a value whose `region` on any line item is not the string literal `"us-east-1"`, THE Zod_Validators SHALL throw a `ZodError` whose path identifies the offending line item.
4. WHEN `parseEstimatePayload` is invoked with a value whose `status` is not a member of the v1 `estimate_status` enum, THE Zod_Validators SHALL throw a `ZodError` identifying the violation.
5. WHEN `parseEstimatePayload` is invoked with a value whose `yearOneStartMonth` is not the first day of a calendar month in `YYYY-MM-01` form, THE Zod_Validators SHALL throw a `ZodError` identifying the violation.
6. WHEN `parseEstimatePayload` is invoked with a value whose `status` is in `{AWAITING_APPROVAL, APPROVED, QUEUED, IN_PROGRESS, COMPLETE, PARTIALLY_COMPLETE, FAILED}` and `pinnedArchitectureRevisionId` is null, THE Zod_Validators SHALL throw a `ZodError` (per design Invariant I-12).
7. WHEN `parseEstimatePayload` is invoked with a value that satisfies every schema rule, THE Zod_Validators SHALL return a fresh deep clone of the input typed as `EstimatePayload` without mutating the input.
8. THE Zod_Validators SHALL export `safeParseEstimatePayload` returning Zod's `SafeParseReturnType` for callers that prefer error handling without exceptions.

### Requirement FR-3: Projection Function

**User Story:** As the Agent 2 Automation Developer, I want a pure function that reshapes a `Validated Payload` into a five-element `Per-Year-Group Payload`, so that I can hand each year to a Pricing Calculator group without re-deriving year arithmetic or grouping logic.

**Source:** Design §"Projection Function" and Algorithm 1; D-07, D-07.4, D-07.6.

#### Acceptance Criteria

1. THE Projection_Function SHALL be a pure function with no side effects and no mutation of its input.
2. WHEN `projectToPerYearGroups` is invoked with a `Validated Payload`, THE Projection_Function SHALL return a `Per-Year-Group Payload` whose `groups` array has exactly five entries indexed Year 1 through Year 5.
3. WHEN computing each group's `startMonth`, THE Projection_Function SHALL produce a date equal to `payload.yearOneStartMonth` plus `(yearIndex − 1) × 12` calendar months (per Invariant I-10).
4. WHEN distributing line items into year groups, THE Projection_Function SHALL include a `YearGroupItem` in `groups[k]` if and only if `lineItem.quantityPerYear[k] > 0`.
5. WHEN populating each `YearGroupItem`, THE Projection_Function SHALL carry the line item's `configuration` forward unchanged into every year group it appears in (per D-07.6 — configuration constant across years).
6. WHEN ordering items within a group, THE Projection_Function SHALL sort by `lineItemId` ascending so that output is deterministic for byte-identical input.
7. IF a line item has `quantityPerYear[k] = 0` for every `k`, THEN THE Projection_Function SHALL omit that line item from every group (no zero-quantity entries in the output).

### Requirement FR-4: Estimate Markdown Renderer

**User Story:** As the Workbench Developer, I want `renderEstimateMd(payload)` to produce a deterministic, total Markdown rendering of any `Validated Payload`, so that finalize time produces a stable artifact that can be stored in S3 and diffed across versions.

**Source:** Design §"Markdown Renderers" and Algorithm 2; D-01, D-06.

#### Acceptance Criteria

1. WHEN `renderEstimateMd` is invoked with a `Validated Payload`, THE Estimate_Renderer SHALL return a UTF-8 string of valid Markdown.
2. WHEN `renderEstimateMd` is invoked with any `Validated Payload`, THE Estimate_Renderer SHALL NOT throw an error (totality, per Invariant I-6).
3. WHEN `renderEstimateMd` is invoked twice with the same `Validated Payload` and the same `Schema Version` and `Renderer Version`, THE Estimate_Renderer SHALL return byte-identical strings (determinism, per Invariant I-5).
4. THE Estimate_Renderer SHALL emit one `## Year N — starting <Month YYYY>` section per group in the projection, in order Year 1 through Year 5.
5. WHEN a year group contains no items, THE Estimate_Renderer SHALL emit the literal placeholder `_No resources in this year._` for that section.
6. WHEN a year group contains items, THE Estimate_Renderer SHALL emit a Markdown table with columns `Service`, `Configuration`, and `Quantity` whose rows include every `YearGroupItem` for that group.
7. THE Estimate_Renderer SHALL emit exactly one HTML-comment metadata block at the end of the document containing `schemaVersion` and `rendererVersion` keys, and no other renderer-time data SHALL appear elsewhere in the output.
8. IF a line item's `configuration` jsonb contains a value the formatter does not have a typed renderer for, THEN THE Estimate_Renderer SHALL fall back to canonical `JSON.stringify` with sorted keys without throwing (per Error Handling Scenario 3).

### Requirement FR-5: Architecture Markdown Renderer

**User Story:** As the Workbench Developer, I want `renderArchitectureMd(payload, archRev)` to wrap the pinned Mermaid revision and Agent 1's commentary into a deterministic Markdown document, so that finalize time produces the second of Screen 3's two output files.

**Source:** Design §"Markdown Renderers" and Algorithm 3; D-06.1, D-06.3.

#### Acceptance Criteria

1. WHEN `renderArchitectureMd` is invoked with a `Validated Payload` and an `ArchitectureRevision` whose `id` equals `payload.pinnedArchitectureRevisionId`, THE Architecture_Renderer SHALL return a UTF-8 Markdown string.
2. WHEN `renderArchitectureMd` is invoked twice with the same arguments and the same `Schema Version` and `Renderer Version`, THE Architecture_Renderer SHALL return byte-identical strings.
3. THE Architecture_Renderer SHALL emit a fenced ` ```mermaid ` code block whose body is exactly `archRev.mermaidSource`.
4. WHERE `archRev.agentCommentary` is non-empty, THE Architecture_Renderer SHALL emit a `## Commentary` section containing that text.
5. THE Architecture_Renderer SHALL emit a metadata block at the end of the document containing `schemaVersion`, `rendererVersion`, and `architectureRevisionId`.
6. IF `archRev.id` does not equal `payload.pinnedArchitectureRevisionId`, THEN THE Architecture_Renderer SHALL throw a `ContractInvariantError` whose message identifies the mismatch.

### Requirement FR-6: Contract Module Surface

**User Story:** As any downstream developer, I want a single import surface (`@/contract`) that re-exports schema types, validators, projection, renderers, and version constants, so that I never have to reach into internal module paths.

**Source:** Design §"Components and Interfaces"; D-01.

#### Acceptance Criteria

1. THE Contract_Module SHALL re-export all named entities required by FR-1 through FR-5 from a single index module (`src/contract/index.ts`).
2. THE Contract_Module SHALL export `CONTRACT_SCHEMA_VERSION` and `RENDERER_VERSION` as string constants.
3. THE Contract_Module SHALL export TypeScript types `EstimatePayload`, `LineItem`, `PerYearGroupPayload`, `YearGroup`, `YearGroupItem`, `Configuration`, `ShareUrlRevision`, and `ArchitectureRevision` matching the design's "Wire payload" section.

### Requirement FR-Harness: Runnable Test Harness

**User Story:** As the Spec Reviewer, I want a single command that loads canonical fixtures, runs them through validators, projection, and renderers, runs the property-based test suite, and prints a pass/fail summary, so that I can confirm the contract holds without reading the implementation.

**Source:** Design §"Test Harness Design" and §"Demo Script"; Rules 2, 3, 8 of `spec-decomposition-rules.md`.

#### Acceptance Criteria

1. WHEN a developer runs `pnpm contract:harness` from a clean checkout after `pnpm install`, THE Test_Harness SHALL load every fixture under `fixtures/sample-estimates/`, run each fixture through `parseEstimatePayload`, `projectToPerYearGroups`, `renderEstimateMd`, and `renderArchitectureMd`, run every property in the `PBT_Suite`, and exit with code 0 if and only if every fixture validates and every property passes.
2. WHEN the `Test_Harness` completes successfully, THE Test_Harness SHALL write to `out/<fixture>.projected.json`, `out/<fixture>.estimate.md`, `out/<fixture>.architecture.md`, and `out/pbt-report.json` for every fixture processed.
3. WHEN the `Test_Harness` is invoked with `--pbt-only`, THE Test_Harness SHALL skip fixture processing and only run the `PBT_Suite`.
4. WHEN the `Test_Harness` is invoked with `--fixture <path>`, THE Test_Harness SHALL process only that fixture and skip the others.
5. THE Test_Harness SHALL print to stdout a human-readable summary line in the form `Fixtures: N / N validated, projected, and rendered` and `PBT properties: M / M passed (1024 cases each, seed=<hex>)`.
6. WHEN `pnpm contract:harness` is run twice from the same checkout against the same fixtures, THE Test_Harness SHALL produce a byte-identical `out/` directory between runs (determinism check, per Invariant I-5).
7. IF any fixture fails Zod validation, projection, rendering, or any PBT property, THEN THE Test_Harness SHALL print the failure path and seed (for PBT failures) and exit with a non-zero code.
8. THE Test_Harness SHALL ship with at least three fixtures: a flat-quantity estimate (same quantity across all five years), a ramping estimate (monotonically increasing quantities), and a sparse estimate (some years with zero quantity for some line items).

## Invariant Requirements

Each requirement below corresponds to one row of the design's "Correctness Properties (Invariants)" table. Per Rule 6 of `spec-decomposition-rules.md`, each PBT-marked invariant has a property-based test that runs in the `Test_Harness`. The deferral for I-11 carries the rationale documented in the design.

### Requirement INV-1: At-Most-One First-Pass Share URL Per Estimate

**User Story:** As the Workbench Developer, I want the database and the validators to jointly enforce that an estimate has at most one active first-pass share URL, so that Screen 5's revision history has a single canonical first-pass row (per D-22).

**Source:** Design Invariant I-1; D-22.

#### Acceptance Criteria

1. THE Drizzle_Schema SHALL declare the partial unique index named in FR-1.3 such that two `INSERT` statements creating two `is_first_pass = true` rows for the same `estimate_id` (with `deleted_at IS NULL`) cause the second to fail with a unique-constraint violation.
2. WHEN the `Test_Harness` runs the property test for I-1 against a generator of share-URL-revision histories, THE PBT_Suite SHALL pass 1024 generated cases without observing a state where two active `is_first_pass = true` rows coexist for any estimate.

### Requirement INV-2: Five-Element Quantity Arrays

**User Story:** As the Agent 2 Developer, I want every line item to have exactly five non-negative integer quantities, so that I never have to handle ragged quantity arrays.

**Source:** Design Invariant I-2; D-07.6.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-2 against a generator that includes both well-formed and ill-formed quantity arrays, THE PBT_Suite SHALL pass 1024 generated cases by accepting every payload with a length-5 tuple of non-negative integers and rejecting every other payload via a `ZodError`.

### Requirement INV-3: Configuration Constant Across Years

**User Story:** As the Agent 2 Developer, I want a line item's `configuration` to be the same object in every year group of the projection, so that I can configure a Pricing Calculator service once per line item rather than per year.

**Source:** Design Invariant I-3; D-07.6.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-3 against a generator of valid `Estimate Payload` instances, THE PBT_Suite SHALL pass 1024 generated cases by verifying that for every line item appearing in multiple year groups of the projection output, the `configuration` field is deep-equal across those groups.

### Requirement INV-4: Region Pinned to us-east-1

**User Story:** As the Agent 2 Developer, I want the contract to refuse any line item whose region is not `us-east-1`, so that I never have to handle multi-region payloads in v1.

**Source:** Design Invariant I-4; D-07.5, D-33.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-4 against a generator that occasionally injects non-`us-east-1` regions, THE PBT_Suite SHALL pass 1024 generated cases by accepting every payload with `region = 'us-east-1'` and rejecting every other payload via a `ZodError`.

### Requirement INV-5: Markdown Renderers Are Deterministic

**User Story:** As the On-Call Engineer, I want byte-identical renderer output for byte-identical inputs, so that diffs of stored Markdown across versions are meaningful and never noisy.

**Source:** Design Invariant I-5; FR-4 AC-3, FR-5 AC-2.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-5 against a generator of valid `Estimate Payload` instances, THE PBT_Suite SHALL pass 1024 generated cases by rendering each payload twice through both renderers and asserting byte-identity of each pair.

### Requirement INV-6: Markdown Renderers Are Total

**User Story:** As the Workbench Developer, I want renderers to never throw on a `Validated Payload`, so that I never have to wrap a finalize call in defensive error handling beyond the existing Zod gate.

**Source:** Design Invariant I-6; FR-4 AC-2.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-6 against a generator of valid `Estimate Payload` instances (including pathological but schema-valid configurations), THE PBT_Suite SHALL pass 1024 generated cases without observing a thrown error from either renderer.

### Requirement INV-7: JSON Round-Trip Identity

**User Story:** As the Agent 2 Developer, I want `Validated Payload`s to survive a JSON round-trip without semantic loss, so that I can serialize a payload onto SQS and deserialize it on Fargate without bespoke transforms.

**Source:** Design Invariant I-7; D-10.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-7 against a generator of valid `Estimate Payload` instances, THE PBT_Suite SHALL pass 1024 generated cases by asserting that for every payload `p`, `parseEstimatePayload(JSON.parse(JSON.stringify(p)))` is deep-equal to `p`.

### Requirement INV-8: Status Transitions Follow the v1 State Machine

**User Story:** As the Workbench Developer, I want the contract to reject status transitions that are not legal in v1, so that I cannot accidentally write `STALE` or `SKIPPED` (removed for v1) into the database.

**Source:** Design Invariant I-8 and §"Status State Machine"; D-11 v1.

#### Acceptance Criteria

1. THE Contract_Module SHALL export an `isLegalEstimateStatusTransition(from, to)` predicate that returns `true` if and only if `(from, to)` is an edge of the v1 estimate state machine diagrammed in the design.
2. WHEN the `Test_Harness` runs the property test for I-8 against a generator of random transition sequences, THE PBT_Suite SHALL pass 1024 generated cases by accepting every legal transition and rejecting every illegal transition.

### Requirement INV-9: Projection Sum Conservation

**User Story:** As the Agent 2 Developer, I want every nonzero quantity in the input to appear exactly once in the projection output, so that I can trust totals match between the per-resource view and the per-year-group view.

**Source:** Design Invariant I-9.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-9 against a generator of valid `Estimate Payload` instances, THE PBT_Suite SHALL pass 1024 generated cases by asserting that the sum of `quantity` over all `YearGroupItem`s in the projection equals the sum of strictly-positive entries of `quantityPerYear` over all line items in the input.

### Requirement INV-10: Year-Start Months Spaced Twelve Months Apart

**User Story:** As the Agent 2 Developer, I want each year group's `startMonth` to be exactly twelve calendar months after the previous group's, so that I can label Pricing Calculator groups by month without recomputing the anchor.

**Source:** Design Invariant I-10; D-07.4.

#### Acceptance Criteria

1. WHEN the `Test_Harness` runs the property test for I-10 against a generator that randomizes `yearOneStartMonth`, THE PBT_Suite SHALL pass 1024 generated cases by asserting that for every projection, `groups[k].startMonth` equals `payload.yearOneStartMonth` plus `k × 12` calendar months for every `k` in `0..4`.

### Requirement INV-11: Audit Log Is Append-Only at the Application Layer

**User Story:** As the Workbench Developer, I want the contract layer to expose no API surface that updates or deletes audit log rows, so that the audit log invariant from D-30.3 cannot be violated by accident.

**Source:** Design Invariant I-11; D-30.3.

**PBT Deferral:** I-11 is structural rather than value-based; the design documents a deferral. Verified instead by the harness asserting no mutation API exists.

#### Acceptance Criteria

1. THE Contract_Module SHALL export only insertion helpers (`appendAuditLogEntry` or equivalent) for `estimate_audit_log` and SHALL NOT export functions that update or delete rows in that table.
2. WHEN the `Test_Harness` runs its structural check for I-11, THE Test_Harness SHALL inspect the public exports of `Contract_Module` and assert that no exported function name matches the patterns `update*AuditLog*`, `delete*AuditLog*`, or accepts a `WHERE` clause targeting `estimate_audit_log`.

### Requirement INV-12: Pinned Architecture Required for Post-Draft States

**User Story:** As the Workbench Developer, I want a payload with `status` past `DRAFT` to be rejected if `pinnedArchitectureRevisionId` is null, so that the architecture file is always present for any estimate that has been approved or run.

**Source:** Design Invariant I-12; D-06.3.

#### Acceptance Criteria

1. THE Zod_Validators SHALL implement the cross-field refinement described in FR-2 AC-6.
2. WHEN the `Test_Harness` runs the property test for I-12 against a generator of `(status, pinnedArchitectureRevisionId)` pairs, THE PBT_Suite SHALL pass 1024 generated cases by accepting every pair where the constraint holds and rejecting every pair where it does not.

## Non-Functional Requirements

### Requirement NFR-1: Deterministic, Pinned Dependencies

**User Story:** As the Spec Reviewer, I want every dependency pinned to an exact minor version, so that running the harness today and a year from now produces the same result.

**Source:** `tech-stack.md` "Versioning & Pinning"; design §"Dependencies".

#### Acceptance Criteria

1. THE Contract_Module SHALL declare `drizzle-orm`, `drizzle-kit`, `zod`, `fast-check`, and `vitest` in `package.json` pinned to specific minor versions consistent with the design's Dependencies table (no open ranges of the form `*` or `latest`).
2. THE Contract_Module SHALL NOT introduce dependencies beyond those listed in the design's Dependencies table without an updated design document.

### Requirement NFR-2: No New AWS or Third-Party Service Dependencies

**User Story:** As the Spec Reviewer, I want the contract layer to add no new infrastructure, so that this spec can be approved without provisioning anything new.

**Source:** Design §"Dependencies" — "AWS Option Declined: None"; `aws-first-preference.md`.

#### Acceptance Criteria

1. THE Contract_Module SHALL NOT introduce any new AWS service dependency, IAM role, or Terraform module.
2. THE Contract_Module SHALL NOT introduce any new non-AWS hosted service dependency.

### Requirement NFR-3: Validated Payloads Are the Trust Boundary

**User Story:** As the Workbench Developer, I want every API path that persists or transports a payload to call `parseEstimatePayload` first, so that the database and downstream consumers always see validated data.

**Source:** Design §"Security Considerations".

#### Acceptance Criteria

1. THE Contract_Module SHALL document, in its README, that `parseEstimatePayload` is the trust boundary and SHALL NOT export an alternate path that bypasses validation.
2. THE Projection_Function and the Estimate_Renderer SHALL accept `EstimatePayload` (the validated type) rather than `unknown`, so that the TypeScript compiler enforces that callers pass through validation first.

### Requirement NFR-4: Performance Envelope

**User Story:** As the Workbench Developer, I want validation, projection, and rendering to complete in well under one second on realistic payloads, so that the finalize HTTP request returns within typical user-perceived latency budgets.

**Source:** Design §"Performance Considerations".

#### Acceptance Criteria

1. WHEN any of `parseEstimatePayload`, `projectToPerYearGroups`, `renderEstimateMd`, or `renderArchitectureMd` is invoked on a payload with up to 100 line items, THE Contract_Module SHALL complete the call in under 100 milliseconds on the developer reference machine documented in the harness output.
2. WHEN the `Test_Harness` runs the full PBT suite, THE Test_Harness SHALL complete in under 60 seconds on the developer reference machine.

### Requirement NFR-5: PBT Reproducibility

**User Story:** As the Spec Reviewer debugging a property failure, I want every PBT run to print its seed, so that I can rerun a failing property deterministically from CI logs.

**Source:** Design §"Property-Based Testing Approach".

#### Acceptance Criteria

1. WHEN any property in the `PBT_Suite` runs, THE PBT_Suite SHALL configure `fast-check` with at least 1024 generated cases per property.
2. IF a property fails, THEN THE PBT_Suite SHALL print the failing case and the deterministic seed in a form that can be passed to `fast-check` via `--seed` to reproduce the failure.

## Out of Scope

This spec is a Horizontal Foundation. Per Rule 4, the test harness is the standalone usefulness; per Rule 4 again, we do not handcuff this spec with stubs for downstream consumers. The list below is reaffirmed from the design and made explicit so reviewers do not look for what is not here.

| Out of Scope | Owning Follow-up Spec | Reason it is not stubbed here |
|---|---|---|
| Agent 1 reasoning logic (Bedrock tool calls, RAG retrieval) | Estimate Authoring Workbench | Agent 1 is a downstream consumer of the contract; this foundation has no upstream caller to mock. |
| Agent 2 Pricing Calculator automation (Playwright templates, Fargate task) | Pricing Calculator Automation | Agent 2 is a downstream consumer; no upstream mock exists or is needed. |
| HTTP API routes, auth middleware, Clerk integration | Estimate Authoring Workbench | The contract is library code consumed by API routes, not the routes themselves. |
| Document parsing pipeline (S3 → Lambda → pgvector) | Document Ingestion | Independent pipeline; touches no contract surface defined here. |
| Pricing Calculator scraping, share URL capture | Pricing Calculator Automation | Produces inputs to `share_url_revisions` rows; the schema is here, the producer is not. |
| Cost capture, YoY visualization | Cost Capture & Visualization | Reads `share_url_revisions` and per-group cost data populated by Agent 2. |
| Real-time UX status polling endpoints | Estimate Authoring Workbench | Reads from `estimates` and `line_items`; the schema is here, the endpoint is not. |
| Notifications, audit log UI surfacing | Output / Version Control spec | Reads from `estimate_audit_log`; the schema is here, the UI is not. |
| New AWS infrastructure (no Lambda, Fargate, S3 bucket, SQS queue, or IAM role is created by this spec) | n/a | Per NFR-2 and the design's "AWS Option Declined: None" note. |

**No upstream mocks.** Per the spec prompt and Rule 4, this foundation has nothing upstream to mock. The harness uses fixtures synthesized in-spec.

## Demo Script

This script is the demonstrable outcome required by Rule 2. It is runnable end-to-end by another team member without verbal hand-holding, per Rule 8.

```
From a clean state:

1. Clone the repository and check out the branch with this spec implemented.
2. Run: pnpm install
3. Run: pnpm db:migrate
   (Requires a local Postgres instance; connection string read from .env)
4. Run: pnpm contract:harness

Observe:

- Stdout shows two summary lines:
    Fixtures: 3 / 3 validated, projected, and rendered
    PBT properties: 11 / 11 passed (1024 cases each, seed=<hex>)
- The out/ directory contains, for each fixture:
    <fixture>.projected.json    (the per-year-group payload Agent 2 will consume)
    <fixture>.estimate.md       (the rendered estimate Markdown)
    <fixture>.architecture.md   (the rendered architecture Markdown)
  plus pbt-report.json with seeds and case counts.
- Exit code is 0.

Confirm:

a. Open out/three-year-ramp.estimate.md
   - See Year 1 through Year 5 sections, each with a Markdown table whose
     quantities match the fixture's per-year quantities.
   - See a metadata block at the bottom with schemaVersion and rendererVersion.

b. Open out/three-year-ramp.projected.json
   - See exactly 5 groups.
   - See items present in a group exactly when the corresponding
     quantityPerYear[k] in the fixture is > 0.

c. Open out/three-year-ramp.architecture.md
   - See a fenced ```mermaid block whose body matches the fixture's
     architecture revision.
   - See a Commentary section iff the fixture's architecture revision
     has non-empty agentCommentary.

d. Determinism check:
   - Run pnpm contract:harness a second time.
   - Diff out/ before and after; the diff is empty.

e. Negative case (validators):
   - Edit a fixture so that one line item's quantityPerYear has 6 elements.
   - Re-run pnpm contract:harness.
   - Stdout prints a Zod error whose path identifies the offending line item
     and field.
   - Exit code is non-zero.

f. PBT reproducibility:
   - Re-run pnpm contract:harness --pbt-only.
   - Note the printed seed.
   - Re-run with the same seed; observe identical case generation.
```

## Traceability Matrix

Each requirement traces to one or more design sections and to the source decisions in `docs/SA-first-pass.md`. Reviewers can use this matrix to confirm that no requirement is invented and no design section lacks coverage.

| Requirement | Design Section(s) | SA Decision(s) | Mandated Test Mechanism |
|---|---|---|---|
| FR-1 Drizzle schema and migration | "Drizzle Schema Module"; "Data Models" | D-02, D-04, D-22, D-29, D-30.3, D-32 | Migration applies; `Test_Harness` schema export check |
| FR-2 Zod validators | "Zod Validators"; "Wire payload" | D-01, D-07.5, D-07.6, D-11 | Unit tests + PBT (INV-2, INV-4, INV-12) |
| FR-3 Projection function | "Projection Function"; "Algorithmic Pseudocode §1" | D-07, D-07.4, D-07.6 | Unit tests + PBT (INV-3, INV-9, INV-10) |
| FR-4 Estimate renderer | "Markdown Renderers"; "Algorithmic Pseudocode §2" | D-01, D-06 | Snapshot tests + PBT (INV-5, INV-6) |
| FR-5 Architecture renderer | "Markdown Renderers"; "Algorithmic Pseudocode §3" | D-06.1, D-06.3 | Snapshot tests + PBT (INV-5, INV-6) |
| FR-6 Contract module surface | "Components and Interfaces" | D-01 | Compile-time export check |
| FR-Harness Test harness | "Test Harness Design"; "Demo Script" | Rule 3 of `spec-decomposition-rules.md` | Demo script (Rule 2 + Rule 8) |
| INV-1 First-pass uniqueness | Invariant I-1 | D-22 | DB unique-index test + PBT |
| INV-2 Length-5 quantity tuple | Invariant I-2 | D-07.6 | PBT |
| INV-3 Configuration constant across years | Invariant I-3 | D-07.6 | PBT |
| INV-4 Region pinned to us-east-1 | Invariant I-4 | D-07.5, D-33 | PBT |
| INV-5 Renderer determinism | Invariant I-5 | Design §"Markdown Renderers" | PBT |
| INV-6 Renderer totality | Invariant I-6 | Design §"Markdown Renderers" | PBT |
| INV-7 JSON round-trip | Invariant I-7 | D-10 | PBT |
| INV-8 Status state machine | Invariant I-8; "Status State Machine" | D-11 | PBT |
| INV-9 Projection sum conservation | Invariant I-9 | Design §"Algorithmic Pseudocode §1" | PBT |
| INV-10 Year-start month arithmetic | Invariant I-10 | D-07.4 | PBT |
| INV-11 Audit log append-only at app layer | Invariant I-11 | D-30.3 | Structural check (PBT deferral documented) |
| INV-12 Pinned architecture for post-DRAFT | Invariant I-12 | D-06.3, D-11 | PBT |
| NFR-1 Pinned dependencies | "Dependencies" | `tech-stack.md` "Versioning & Pinning" | `package.json` review |
| NFR-2 No new AWS / third-party services | "Dependencies"; "AWS Option Declined: None" | D-25 | `package.json` and Terraform diff review |
| NFR-3 Trust boundary at validators | "Security Considerations" | D-01 | API surface review |
| NFR-4 Performance envelope | "Performance Considerations" | n/a (engineering norm) | Harness timing report |
| NFR-5 PBT reproducibility | "Property-Based Testing Approach" | Rule 6 of `spec-decomposition-rules.md` | Harness output |
