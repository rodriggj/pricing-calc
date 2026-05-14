# Steering Docs Plan

This document captures the analysis and decisions about which steering docs to author before the first spec, and how to structure the rules that govern spec decomposition.

---

## Which Steering Docs Are Needed Before the First Spec?

Of the nine steering docs identified during architecture trade-off work (`SA-first-pass.md`), three are essential before the first spec, four are valuable but should land in parallel during early spec work, and two are deferred until the relevant work begins.

### Author Before the First Spec (3)

1. **`spec-decomposition-rules.md`** — The most important to author first because it shapes how every other spec is decomposed. Contains the eight rules detailed below.

2. **`tech-stack.md`** — Locks framework, language, DB, ORM, auth, and LLM provider. Every spec from here onward references these. Without it, every spec re-litigates "are we using Drizzle? Bedrock or OpenAI?"

3. **`aws-first-preference.md`** — Establishes the default rule from D-25. Short (a page); prevents architecture drift across specs.

### Author in Parallel During Early Spec Work (4)

These benefit from being grounded in real spec content rather than written cold.

4. **`data-model-conventions.md`** — Best authored as the first spec lands the initial schema. Codifying tenancy and team-access patterns from a real example beats writing them abstractly.

5. **`agent-contract.md`** — Will be largely *written by* the first spec (Estimate Format & Contract). Promote the spec's contract section to a steering doc once stable.

6. **`audit-and-team-access.md`** — Pairs with `data-model-conventions.md`. Author when team/audit tables are being designed.

7. **`observability-conventions.md`** — Author when the first service emits logs and metrics. Writing it abstractly produces generic advice that never gets followed.

### Defer Until Relevant Work Begins (2)

8. **`iac-with-terraform.md`** — Author when the infra spec begins, not before. The conventions only matter once we have modules to write.

9. **`template-authoring.md`** — Author when the first declarative template is being designed.

### Folded Into Tech Stack

10. **`bedrock-model-policy.md`** — Trivial; lives as a section in `tech-stack.md` instead of its own file.

---

## Decomposition Constraints (User-Provided)

Two constraints frame the spec-decomposition steering doc:

1. Each spec is Epic-sized — **no more than ~15 tasks**.
2. Each spec produces a **functional, testable, validatable component** before proceeding.

These are different ideas; the steering doc treats them as separate principles.

---

## The Eight Spec-Decomposition Rules

Committed to `.kiro/steering/spec-decomposition-rules.md`. Rule 6 is mandated but soft (deferrals require documented rationale; expected to be rare after the first 2–3 specs).

1. **Spec size ceiling.** A spec has ≤15 leaf tasks. Drafts that exceed this are split.
2. **Demonstrable outcome.** Every spec finishes with a human-runnable demonstration that the work delivers value. "Tests pass" alone is insufficient.
3. **Spec shape declaration.** Every spec declares its shape: vertical slice, horizontal foundation, or glue. Foundations require a test harness as part of deliverables.
4. **Standalone usefulness.** A spec is independently testable and reviewable. If it depends on future work to be useful, mock the dependency.
5. **Acceptance criteria as user-observable outcomes.** Acceptance criteria describe what a user (or harness) can observe, not implementation steps.
6. **Property-based tests for invariants (mandated, soft for early specs).** When a spec defines an invariant, it includes a property-based test exercising it. Deferral allowed with documented rationale; expected to be rare after the first 2–3 specs.
7. **Specs decompose to other specs, not to undocumented future work.** When a spec is too big and gets decomposed, every chunk produces a follow-up spec stub.
8. **Demo script.** Every spec ends with a demo script: "From a clean state, do X. Observe Y. Confirm Z."

---

## Three Valid Spec Shapes

- **Vertical slice** — User-visible feature touching every layer needed to make it work (UI → API → DB → external). Default shape; preferred for v1.
- **Horizontal foundation** — Non-user-facing component (e.g., a parser Lambda) that's exercised by an explicit harness or integration test. Allowed only when downstream specs would be paralyzed without it.
- **Glue** — Connects two existing components. Smallest shape; usually <5 tasks.

---

## Applied to v1 Spec Sequence

Under these rules, the v1 spec sequence is:

1. **Estimate Authoring Workbench** (Vertical Slice) — Sign in, create named estimate, upload documents, chat with Agent 1, view generated Mermaid architecture, see Detail List. **Mocks Agent 2** with a stub returning a fake share URL.
2. **Approval & Queue** (Glue + Vertical extension) — Approve, enqueue, status transitions, workbench lock. Builds on #1; Agent 2 stub becomes a slow-mock for exercising lock semantics.
3. **Pricing Calculator Automation** (Horizontal Foundation) — Real Agent 2 with Playwright executing declarative templates against the real calculator for a single service (start with EC2). Replaces the stub.
4. **Year-Group Modeling and Cost Capture** (Vertical Slice on #3) — Create-group templates, multi-year line items, per-group total scraping.
5. **Output, YoY Visualization, Share URL Revisions** (Vertical Slice) — Screen 5 with chart, revision history, name editing.
6. **Team Membership and Audit Log** (Vertical Slice) — Invite flow, team-based access checks, audit log, activity view.

Each is ≤15 tasks. Each produces a functioning piece. Each builds on the prior. After spec 1, the app is demoable even before the calculator integration is real.

---

## Decisions Confirmed in This Pass

- Author exactly three steering docs before the first spec: `spec-decomposition-rules.md`, `tech-stack.md`, `aws-first-preference.md`.
- The eight decomposition rules are the right shape; commit them as written.
- Rule 6 (PBT) is mandated by default but allows documented deferrals, especially for the first 2–3 specs.
- The remaining six steering docs land in parallel as relevant spec work surfaces them.
