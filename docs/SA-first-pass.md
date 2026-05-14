# Solution Architecture — First Pass Trade-Off Decisions

This document captures the key architectural decision points surfaced by the first-pass review of the sequence diagram and storyboards. Each entry lists the decision, the viable options, a recommendation, and the justification. Decisions are ordered by blast radius — earlier decisions constrain later ones.

> Status legend: **[Recommended]** — proposed default; **[Alternative]** — viable; **[Rejected]** — captured for completeness so we don't relitigate.

---

## v1 Scope Ground Rules (Anchor)

Locked-in scope for v1, which constrains several decisions below:

1. **Agent 1 → Agent 2 is a one-shot first-pass flow.** Each estimate has at most one successful Agent 2 run. No re-runs against an existing calculator estimate.
2. **Edits happen in the AWS Pricing Calculator directly** after first-pass publish. The app does not read calculator state back.
3. **Version history is user-curated via share URL revisions.** Users may paste updated share URLs into the app to track that the estimate has evolved; the app stores those URLs but does not re-scrape costs.
4. **Screen 5's YoY chart reflects only the first-pass run.** Subsequent calculator edits are not reflected.
5. **Iterative re-runs and read-back from calculator → app are roadmap items.**

These ground rules are referenced by D-05, D-07, D-11, D-13, D-16, D-21, and D-22 through D-24.

---

## D-01. Agent-to-Agent Contract Format

**Status:** ✅ **CONFIRMED — Option C**

**Question:** What format does Agent 1 hand off to Agent 2?

**Options:**

- **A. Free-form Markdown only** [Rejected] — Brittle for Agent 2's deterministic parsing; LLM-generated markdown drifts.
- **B. Structured JSON only** [Alternative] — Clean machine contract but loses human-reviewable artifact required by Screen 3.
- **C. Hybrid: structured JSON as source of truth, Markdown rendered from it** [Recommended / Confirmed]

**Recommendation:** **C.** Persist the estimate as a structured object in Neon. Render Markdown views on demand for human review and as one of the two output files referenced in Screen 3.

**Justification:** Storyboards show a Detail List of structured line items, which means structured data must already exist in the DB before "Create Estimate" is clicked. The Markdown file becomes a *projection* of state rather than a primary artifact. Agent 2 consumes the structured object directly, eliminating LLM-parse-LLM coupling. Schema can be versioned and validated independently.

---

## D-02. Primary Datastore

**Status:** ✅ **CONFIRMED — Option B (Neon Postgres + Drizzle)**

**Question:** What backs the application data?

**Options:**

- **A. DynamoDB** [Rejected] — Original sequence-diagram assumption; poor fit for the relational shape implied by the storyboards.
- **B. Neon (Postgres)** [Recommended / Confirmed]
- **C. RDS Postgres** [Alternative] — Same model, more ops overhead, no serverless story.

**Recommendation:** **B. Neon** with Drizzle ORM as specified in the storyboard.

**Justification:** Relational data shape, transactional edits to line items, and the need for joins across estimate/document/share-url-revision tables align with Postgres. Neon's serverless and branching capabilities suit a low-volume, bursty workload. Drizzle gives type safety end-to-end with the Next.js / TypeScript stack.

---

## D-03. Document Storage

**Status:** ✅ **CONFIRMED — Option B (S3 + Neon metadata)**

**Question:** Where do user-uploaded artifacts (pptx, xlsx, docx, pdf, md) live?

**Options:**

- **A. Blob columns in Neon** [Rejected] — Inflates DB size, slows queries, awkward for large PPTX.
- **B. S3 with metadata in Neon** [Recommended / Confirmed]
- **C. Vercel Blob / Cloudflare R2** [Alternative] — Viable; pick if AWS is undesired for storage.

**Recommendation:** **B.** S3 bucket per environment, metadata row per document in Neon (id, estimate_id, owner_id, mime, size, s3_key, version, status).

**Justification:** Standard split. Keeps DB lean. Pre-signed URLs for upload/download avoid proxying bytes through the Next.js app. Plays well with downstream parsing pipeline (Lambda triggered on S3 PUT).

---

## D-04. Multi-Tenancy Model

**Status:** ✅ **CONFIRMED — Option B (Clerk Organizations + owner/org rows)**

**Question:** What's the tenancy scope?

**Options:**

- **A. Single user only** [Rejected] — Clerk supports orgs; no reason to retrofit later.
- **B. User + Organization (Clerk Organizations)** [Recommended / Confirmed]
- **C. Custom tenancy table** [Rejected] — Reinventing what Clerk gives free.

**Recommendation:** **B.** Every domain row carries `owner_id` (user) and `org_id` (Clerk organization, nullable for personal estimates). Row-level access enforced in Drizzle queries.

**Justification:** Clerk Organizations is purpose-built for this. Trivial to add now, expensive later. Sets up sharing semantics for Screen 5's revision history.

---

## D-05. Estimate Versioning Semantics

**Status:** ✅ **CONFIRMED — User-curated share URL revisions; v1 has at most one Agent 2 run per estimate**

**v1 reframing per ground rules:** Each estimate has exactly one Agent 2 run. There is no app-driven "version per run" model in v1 because there's only one run. Version-like history is captured through user-supplied share URL revisions (see D-22).

**Question:** When does a new "version" get created?

**Options:**

- **A. New version on every Detail List edit** [Rejected] — Too noisy.
- **B. New version on each "Create Estimate" submission** [Rejected for v1] — v1 is one-shot.
- **C. New version on each Agent 2 run** [Deferred to roadmap] — v1 has only one run.
- **D. User-supplied share URL revisions captured as a revision history** [Recommended / Confirmed for v1]

**Recommendation (final):** **D for v1.** The first revision is the share URL produced by Agent 2 (`is_first_pass = true`). Subsequent revisions are user-pasted URLs reflecting edits made directly in the calculator. v1 stores them; v1 does not re-scrape.

### D-05-ROADMAP: Multi-run estimates

When iterative Agent 2 runs are added (see D-13-ROADMAP), reintroduce per-run versions and merge them with the user-curated share URL revisions.

---

## D-06. Architecture Output File — Generated or Reformatted?

**Status:** ✅ **CONFIRMED — Option B (Agent 1 generates the architecture)**

**Clarification from user:** Uploaded content is generally *not* an architecture. It's RFP requirements, ground rules, assumptions, constraints, and archetypes intended to give Agent 1 context. Agent 1 is responsible for producing the architecture artifact, and any user-driven change in context that materially affects the design triggers Agent 1 to revise the architecture.

**Question:** Screen 3 produces an "architecture file" alongside the estimate file. What is it?

**Options:**

- **A. Reformatted/normalized version of user-uploaded architecture content** [Rejected] — User uploads aren't architectures; they're context inputs.
- **B. Agent 1 generates a new architecture artifact from context + conversation** [Recommended / Confirmed]
- **C. Both — start with A, add B in a later phase** [Rejected] — Superseded by clarification.

**Recommendation (final):** **B.** Agent 1 generates an architecture artifact from user-uploaded context (requirements, GR&As, constraints, archetypes) and conversational refinements. Architecture is regenerated when material context changes, with user-triggered override. Each regeneration creates a new `architecture_revision` row referenced by the Image Viewer. v1 produces Mermaid; v2 may add richer formats.

**Justification:** Matches the actual user journey: users provide *inputs that shape* an architecture, not the architecture itself. Treating the architecture as a living artifact maintained by Agent 1 keeps the human-in-the-loop focused on requirements and trade-offs rather than diagram authoring.

### D-06.1 Architecture Format

**Decision:** Mermaid for v1, with richer formats (Python `diagrams` library, draw.io XML) on the v2 roadmap.

**Justification:** Mermaid is text-based and LLM-friendly, renders natively in markdown contexts, diff-able under version control, and zero runtime cost. Image-model generation produces unreliable AWS diagrams and is not on the roadmap.

### D-06.2 Regeneration Trigger

**Decision:** Agent-determined material-change trigger only, with a user-initiated "Regenerate Architecture" override.

**Material-change criteria (initial heuristic, refine in spec):**

- New supporting document added or removed
- Context Capture entries (ground rules, assumptions, constraints) added, removed, or substantively edited
- Significant change to the Detail List (additions, removals, or quantity/configuration changes that shift the topology)
- Direct user request via the Regenerate button

Chat-only turns that don't change context or line items do **not** trigger regeneration. Agent 1 is responsible for the "is this material" judgment.

### D-06.3 Versioning Interaction

**Decision:** Architecture revisions are tracked in their own `architecture_revisions` table, keyed on `estimate_id`. Each revision row stores: source content snapshot, generated Mermaid artifact, model + prompt metadata, regeneration reason, timestamp. The estimate pins the architecture_revision_id that was current at the moment of "Create Estimate" approval.

### D-06.4 Image Viewer Rendering

**Decision:** Mermaid rendered client-side in the Image Viewer with a "View source" toggle exposing the raw Mermaid text.

---

## D-07. Cost Data Acquisition

**Status:** ✅ **CONFIRMED — Option A (Pricing Calculator scrape, one-shot, with YoY modeled via per-year groups)**

**v1 reframing per ground rules:** Cost figures are captured exactly once during the initial Agent 2 run. Screen 5's YoY chart renders from that snapshot for the life of the estimate. v1 does not re-scrape after subsequent user edits in the calculator.

**Clarification from user:** The 5-year cost profile is sourced from the Pricing Calculator output, not the Price List API. Agent 2 uses the calculator's "Create Group" feature with one group per year. Agent 1 produces an estimate format that itemizes year-over-year resource requirements; Agent 2 mirrors that structure into year groups via Playwright.

**Question:** How do we get the dollar figures needed for Screen 5's YoY chart?

**Options:**

- **A. Scrape totals from the Pricing Calculator after Agent 2 populates it** [Recommended / Confirmed]
- **B. Compute locally using the AWS Price List API against the structured estimate** [Rejected for v1]
- **C. Both, with reconciliation** [Roadmap candidate]

**Recommendation (final):** **A.** Agent 2 creates a year-group per calendar year, populates each group with that year's resources, captures per-group monthly/annual totals plus the overall 5-year total, and persists everything to Neon. The Pricing Calculator share URL is the canonical artifact; scraped totals back Screen 5's YoY chart.

### D-07.1 Pre-Approval Cost Preview

**Decision:** **No preview in the workbench.** The Estimate Workbench is a clarification surface, not a numbers surface. Costs only appear on Screen 5 after Agent 2 completes.

### D-07.2 Multi-Year Commitments

**Decision:** **On-demand pricing only for v1.** All resources priced as on-demand. RIs, Savings Plans, and EDP discounts are explicitly out of scope for v1; users may manually adjust the calculator after Agent 2 finishes if they need them. Modeling commitments is a roadmap item.

### D-07.3 Captured & Persisted Cost Data

**Decision:** Agent 2 persists per first-pass run:

- Per-group monthly cost (Year 1 through Year 5)
- Per-group annual cost (12 × monthly)
- Overall 5-year total
- Per line item monthly cost (enables Screen 5 drill-down)
- Capture timestamp
- Pricing Calculator share URL (the first-pass URL)

### D-07.4 Year Boundaries

**Decision:** Rolling 12-month calendar years starting in the month the estimate is generated.

### D-07.5 Region

**Decision:** us-east-1 default for all resources, all years. UI displays a disclaimer establishing this as a v1 ground rule.

### D-07.6 Year-over-Year Variations

**Decision:** Quantity changes only. Resource configuration is constant across years; quantities vary based on Agent 1's growth projections.

### D-07.7 Calculator Account Context

**Decision:** Anonymous estimates. Agent 2 creates Pricing Calculator estimates without an AWS account context. Share URLs are the only handle.

### D-07-ROADMAP-1: Re-scrape on user-supplied URL update

When the user pastes an updated share URL (per D-22), optionally re-scrape totals to refresh Screen 5's YoY chart. Trigger condition: user demand surfaces in feedback, or product instrumentation shows >30% of estimates accumulating multiple share URL revisions.

### D-07-ROADMAP-2: Reconciliation against Price List API

Reconcile scraped Pricing Calculator totals against an independent Price List API computation to surface drift. Trigger condition: template-level success rate per D-19 falls below 95% sustained, or post-mortems reveal silent calculator math discrepancies.

---

## D-08. Resource Template Shape (Agent 2 / Playwright)

**Status:** ✅ **CONFIRMED — Option C (Hybrid: declarative-first with imperative escape hatches)**

**Question:** How are per-service Pricing Calculator interactions encoded?

**Options:**

- **A. Imperative TypeScript Playwright scripts per service** [Rejected] — Maintenance burden as service count grows.
- **B. Declarative JSON templates only** [Rejected] — Risks blocking on services with non-form interactions.
- **C. Hybrid: declarative-first with imperative escape hatches for edge cases** [Recommended / Confirmed]

**Recommendation (final):** **C.** Define a JSON template schema describing screens, selectors, field types, and value-mappings from estimate fields. A generic executor walks the template by default. When a calculator screen cannot be expressed declaratively, the template references a named imperative override (a TypeScript function in the codebase) that runs in place of the declarative step.

**Schema sketch:**

```
{
  "service": "ec2",
  "screens": [
    { "type": "form", "selectors": {...}, "fields": [...] },
    { "type": "imperative", "handler": "ec2.configurePricingModel" }
  ]
}
```

**Justification:** Declarative-first preserves the review-ability, diffability, RAG-compatibility, and reproducibility benefits while preventing the executor from becoming a straitjacket on service screens that don't fit a form-fill model. Imperative handlers are explicit, named, and reviewable in PRs.

**v1 ground rules to keep this disciplined:**

- Imperative handlers are colocated with their templates and use the same versioning lifecycle
- Each imperative handler must declare its inputs and outputs in the same schema vocabulary as declarative steps
- Code review checklist flags new imperative handlers
- Metric tracks the ratio of declarative steps to imperative steps; if imperative usage climbs above ~20% of total steps, the schema needs richer primitives

**Initial service coverage:** EC2, S3, RDS, Lambda, DynamoDB, CloudFront. Plus cross-cutting templates: create-estimate, create-group (Year N), set-active-group, capture-group-totals, capture-share-url.

---

## D-09. Agent 2 Runtime

**Status:** ✅ **CONFIRMED — Option B (Fargate)**

**Question:** Where does the Playwright agent run?

**Options:**

- **A. AWS Lambda with Playwright layer** [Alternative] — 15-min cap, cold-start risk for heavy browser bundles.
- **B. AWS Fargate task** [Recommended / Confirmed]
- **C. ECS on EC2** [Rejected] — Operational overhead not justified.
- **D. Step Functions orchestrating per-line-item Lambdas** [Alternative] — More complex.

**Recommendation:** **B. Fargate.** One task per estimate run, container with Playwright pre-installed.

**Justification:** Pricing Calculator runs can exceed Lambda's 15-min ceiling for large estimates. Fargate gives a warm browser context for the duration of a single run, simpler debugging, and predictable cost.

---

## D-10. Queue Strategy

**Status:** ✅ **CONFIRMED — Option A (SQS Standard + Neon-based estimate locking)**

**Question:** SQS standard or FIFO? Concurrency model?

**Options:**

- **A. SQS Standard, single consumer per estimate** [Recommended / Confirmed]
- **B. SQS FIFO with MessageGroupId = estimate_id** [Alternative]
- **C. Direct EventBridge → Fargate via API** [Rejected] — Loses retry/DLQ ergonomics.

**Recommendation:** **A.** Standard queue, with estimate-level locking in Neon (`estimate.run_lock` column with TTL). DLQ for poison messages. One Fargate task processes the entire estimate sequentially.

**Justification:** Sequential per-estimate execution avoids Pricing Calculator session contention. DB-level locking is simpler to reason about than FIFO mechanics for this volume.

---

## D-11. Status State Machine

**Status:** ✅ **CONFIRMED — Option C (Two-layer state machine), STALE state deferred to roadmap per v1 ground rules**

**v1 reframing per ground rules:** Without re-reading calculator state, drift detection is impossible. STALE state is dropped from v1.

**Question:** What states does an estimate transition through?

**Options:**

- **A. Binary complete/failed** [Rejected]
- **B. Estimate-level multi-state** [Alternative]
- **C. Estimate-level state machine + per-line-item status** [Recommended / Confirmed]

**Recommendation (final):** **C** with v1-pruned states:

```
Estimate (v1):  DRAFT → AWAITING_APPROVAL → APPROVED → QUEUED →
                IN_PROGRESS → COMPLETE | PARTIALLY_COMPLETE | FAILED

Line Item (v1): PENDING → IN_PROGRESS → ADDED | FAILED
```

`SKIPPED` removed from v1 line-item states because every first-pass run starts with an empty calculator estimate (no items to skip). `UPDATED` likewise removed for v1 since there's only ever an ADD operation. Both retained in the roadmap version.

**Justification:** Screen 4 uses Status as a UX surface; per-line-item status enables targeted error messages. Pruning unreachable states keeps the v1 implementation honest.

### D-11-ROADMAP: Re-introduce STALE, SKIPPED, UPDATED

When iterative re-runs land (per D-13-ROADMAP), reintroduce these states. STALE handles drift detection. SKIPPED and UPDATED handle hash-based dedup during re-runs.

---

## D-12. Real-Time UX Updates

**Status:** ✅ **CONFIRMED — Option A (Client polling for v1)**

**Question:** How do Screens 4 and 5 stay current without manual refresh?

**Options:**

- **A. Client polling at 3–5s** [Recommended / Confirmed for v1]
- **B. Server-Sent Events from Next.js route handler** [Roadmap]
- **C. WebSockets via separate gateway** [Roadmap, conditional]

**Recommendation (final):** **A.** Frontend polls `GET /estimates/{id}/status` every 3–5 seconds while a run is active. Polling stops automatically when the estimate reaches a terminal state.

**Polling specifics for v1:**

- Active poll interval: 3 seconds during IN_PROGRESS, 5 seconds during QUEUED
- Backoff to 10 seconds after 2 minutes of inactivity on the page
- Single endpoint returns aggregated estimate status + per-line-item statuses + per-group cost summary if available
- ETag / If-None-Match headers to short-circuit unchanged responses

### D-12-ROADMAP-1: Server-Sent Events (Option B)

**Trigger conditions (any one warrants migration):**

- Concurrent active estimate runs across all users exceeds **50** at peak (driving polling load past ~17 req/s sustained)
- Neon read load attributable to status polling exceeds **30%** of total query volume
- Median time-to-update on the Queue page (Screen 4) exceeds **5 seconds** as observed in real-user metrics
- More than **3 concurrent estimates per active user session** becomes a common pattern

**Implementation:** Next.js route handler with `Content-Type: text/event-stream` plus Postgres `LISTEN/NOTIFY` for status changes (Neon supports this natively). Backwards-compatible with the polling endpoint via feature flag.

**Effort estimate:** ~1 sprint.

### D-12-ROADMAP-2: WebSockets via API Gateway (Option C)

**Trigger conditions (any one warrants migration):**

- Bidirectional realtime requirements emerge — collaborative editing, live cursors, in-app chat
- Concurrent active estimate runs exceeds **500** sustained, where SSE connection count starts straining the Next.js runtime
- Cross-tab synchronization becomes a UX requirement
- Multi-region deploys require a centralized broker SSE cannot easily provide

**Effort estimate:** ~2–3 sprints. Substantially refactors the realtime layer.

### Migration Decision Cadence

Re-evaluate D-12 status quarterly or after any trigger condition is observed for **two consecutive weeks**. Document trigger observations in the operational metrics dashboard (per D-19).

---

## D-13. Idempotency for Agent 2

**Status:** ✅ **CONFIRMED — Run-level idempotency for v1 (per-line-item hashing deferred to roadmap)**

**v1 reframing per ground rules:** With one Agent 2 run per estimate, idempotency is at the run level rather than the line-item level. Per-line-item hashing isn't needed for v1.

**Question:** How do we make Agent 2 safe to retry?

**Options:**

- **A. Per-line-item idempotency keys (hash of service + config + region + year + quantity)** [Deferred to roadmap]
- **B. Run-level idempotency: at most one successful run per estimate; partial-run retries discard and start fresh** [Recommended / Confirmed for v1]
- **C. Wipe and rebuild the calculator on every run** [Rejected] — Loses share URL stability.
- **D. Trust Pricing Calculator's own dedup** [Rejected] — None exists.

**Recommendation (final):** **B for v1.** The estimate carries a `run_id` and an `is_run_completed` flag. On Fargate task crash or restart mid-run, the in-progress calculator estimate is abandoned (the share URL is never published, so it never enters revision history) and a fresh attempt starts from scratch. Once a run succeeds, the share URL is captured and no further runs occur for that estimate.

**Justification:** With a single one-shot run per estimate, full per-line-item dedup isn't required. Run-level idempotency is dramatically simpler and matches the v1 scope exactly.

### D-13-ROADMAP: Per-line-item hash-based idempotency

When iterative re-runs are added, switch to hash-based dedup so subsequent runs can compute deltas, skip unchanged items, and update only what's needed. Hash inputs: service + config + region + year + quantity. Trigger condition: D-05-ROADMAP and D-07-ROADMAP-1 land together (multi-run with re-scrape).

---

## D-14. Document Parsing Pipeline

**Status:** ✅ **CONFIRMED — Option B (S3 PUT → Lambda → pgvector)**

**Question:** How are uploaded artifacts (pptx, xlsx, docx, pdf, md) turned into context for Agent 1?

**Options:**

- **A. Inline parsing in the Next.js request path** [Rejected] — Times out on large files.
- **B. S3 PUT → Lambda → extracted text + embeddings into pgvector on Neon** [Recommended / Confirmed]
- **C. Third-party doc-AI service (Unstructured, LlamaParse)** [Roadmap fallback]

**Recommendation (final):** **B.** S3 ObjectCreated event triggers a parsing Lambda per upload. The Lambda extracts text per format (pptx/xlsx/docx/pdf/md), chunks it, generates embeddings via Bedrock, and writes both chunks and vectors into Neon (pgvector). Document metadata row in Neon is updated with status (PENDING → PARSED | FAILED).

**Justification:** S3-triggered Lambda is the standard pattern, isolates parsing failures, and produces embeddings ready for RAG. Neon supports `pgvector`, keeping vector storage in the same DB simplifies operations.

**Roadmap (D-14-ROADMAP):** Swap-in third-party doc-AI service (Unstructured, LlamaParse, or AWS Textract) for hard cases — PPTX with embedded diagrams, scanned PDFs with no extractable text, complex tables. Trigger condition: in-house parsing accuracy on real user documents falls below an acceptable threshold (defined during v1 telemetry collection).

---

## D-15. RAG Architecture

**Status:** ✅ **CONFIRMED — Two RAG paths**

**Question:** What does the RAG layer look like?

**Recommendation (final):** Two distinct RAG paths.

- **User documents:** S3 + pgvector on Neon, scoped by `estimate_id`. Embeddings generated per chunk by the parsing Lambda (D-14). Retrieval is per-estimate; one estimate's documents never bleed into another's context.
- **Resource templates (Agent 2):** Versioned in Git, baked into the Fargate image at build time. Optionally embedded for Agent 1 to reason about which AWS services and configurations are available, but the canonical source remains the Git-tracked JSON files.

**Justification:** User documents are dynamic, per-estimate, and benefit from semantic search. Templates are slow-changing infrastructure-as-code that benefits from PR review, diff history, and CI testing. Treating them differently matches their lifecycles.

---

## D-16. Approval Flow Placement

**Status:** ✅ **CONFIRMED — Option A, with v1 framing as a one-shot commit**

**Question:** Where does the human-in-the-loop sit?

**Options:**

- **A. Single approval gate before Queue** [Recommended / Confirmed for v1]
- **B. Per-line-item approval** [Rejected] — Friction without clear benefit.
- **C. Two gates — pre-Agent-2 and post-Agent-2 reconciliation** [Roadmap]

**Recommendation (final):** **A.** A single gate that throttles Agent 2 invocation. With v1 ground rules, approval is the user's commitment to a one-shot first-pass. UI copy reflects this: "After approval, refinements happen directly in the AWS Pricing Calculator. The app will track future revisions you paste back in."

**Justification:** Storyboard Screen 3 ends at "Create Estimate," implying a single gate. Editable Detail List was originally proposed but rejected (per D-07.1 framing); the workbench is a clarification surface, not a validation surface.

### D-16-ROADMAP: Post-run reconciliation gate

When iterative runs and re-scrape land, add a post-run review where users see what Agent 2 did and decide whether to accept, retry, or refine. Trigger: D-13-ROADMAP and D-07-ROADMAP-1 land together.

---

## D-17. Authentication & Authorization

**Status:** ✅ **CONFIRMED — Option A (Clerk + Organizations)**

**Question:** Who builds the auth?

**Options:**

- **A. Clerk** [Recommended / Confirmed] — Specified by storyboard.
- **B. AWS Cognito** [Rejected] — Storyboard explicitly chose Clerk.
- **C. NextAuth/Auth.js** [Rejected] — More DIY than warranted.

**Recommendation:** **A. Clerk** with Organizations enabled. Authorization derived from `org_id` membership and per-row ownership in Neon.

---

## D-18. LLM / Agent Provider

**Status:** ✅ **CONFIRMED — Option A (Amazon Bedrock)**

**Question:** Where do Agent 1 and Agent 2 reason?

**Options:**

- **A. Amazon Bedrock (Claude / Nova)** [Recommended / Confirmed]
- **B. OpenAI / Anthropic API direct** [Alternative — kept as swap-in via abstraction]
- **C. Local model** [Rejected]

**Recommendation:** **A. Bedrock** for both agents.

**Justification:** Aligns with the AWS-Solutions-Architect framing and keeps customer data within AWS. Bedrock supports tool-use patterns needed for Agent 2's template execution. Provider-agnostic abstraction in the codebase keeps **B** as a swap-in option.

---

## D-19. Observability

**Status:** ✅ **CONFIRMED — Option A (CloudWatch + structured logs + custom metrics)**

**Question:** What's the observability story?

**Options:**

- **A. CloudWatch Logs + custom metrics** [Recommended / Confirmed]
- **B. OpenTelemetry to a third-party (Datadog, Honeycomb)** [Roadmap]
- **C. Nothing structured for v1** [Rejected]

**Recommendation:** **A.** Structured JSON logs with a request correlation ID threaded through Frontend → API → Queue → Agent 2 → Lambda parser. Custom CloudWatch metrics for:

- Bedrock token usage per estimate (Agent 1 + Agent 2 separately)
- Fargate task minutes per Agent 2 run
- Playwright failure rate per template
- Per-template success rate (leading indicator of Pricing Calculator UI drift)
- Declarative-vs-imperative step ratio per run (per D-08)
- Document parsing success rate by file format
- Polling endpoint hit rate (drives D-12 roadmap triggers)

**Justification:** Cost drivers (Bedrock tokens, Fargate minutes) need instrumentation from day one. Template-level success rate is the leading indicator of Pricing Calculator UI drift. CloudWatch is the AWS-native default and aligns with the AWS-first preference (D-25).

---

## D-20. Secrets & Credential Handling

**Status:** ✅ **CONFIRMED — Option B (AWS Secrets Manager + Vercel env for frontend-public secrets)**

**Question:** Where do API keys, DB URLs, and Clerk secrets live?

**Options:**

- **A. Vercel/Next.js env vars only** [Rejected] — Inadequate for Fargate workloads.
- **B. AWS Secrets Manager + Vercel env for frontend-only secrets** [Recommended / Confirmed]
- **C. SSM Parameter Store** [Alternative]

**Recommendation (final):** **B.** Frontend-public config (Clerk publishable key, public site URL) in Vercel environment variables. All backend secrets — Neon DB URL, Bedrock IAM credentials, Clerk backend key, S3 access, SQS access — in AWS Secrets Manager, consumed by the Fargate task role and Lambda execution roles via IAM.

**Justification:** Standard separation. Secrets Manager rotation is a useful future capability and aligns with the AWS-first preference (D-25).

---

## D-21. Workbench Concurrency During Agent 2 Run

**Status:** ✅ **CONFIRMED — Lock the Workbench during Agent 2 execution and after first-pass completion**

**v1 reframing per ground rules:** Because v1 is one-shot, the workbench locks during the run *and stays locked* after the run completes. The estimate is "shipped" — no more authoring against it. Users wanting to iterate create a new estimate per D-24.

**Question:** What can the user do in the Estimate Workbench while Agent 2 is running for that estimate?

**Options:**

- **A. Lock the workbench until Agent 2 reaches a terminal state** [Recommended / Confirmed]
- **B. Allow continued Agent 1 chat** [Rejected]
- **C. Auto-cancel the in-flight Agent 2 run on a new "Create Estimate" click** [Rejected]

**Recommendation (final):** **A.** Workbench is read-only when estimate.status is QUEUED, IN_PROGRESS, COMPLETE, PARTIALLY_COMPLETE, or FAILED. Persistent UI banner explains the lock state in plain language and changes copy based on status:

- **QUEUED / IN_PROGRESS:** "This estimate is being built in the AWS Pricing Calculator. The workbench will unlock when the run completes."
- **COMPLETE / PARTIALLY_COMPLETE / FAILED:** "First-pass complete. Refinements happen in the AWS Pricing Calculator directly. To start over, create a new estimate."

**Implementation notes:**

- Lock state derived from estimate.status — no separate `workbench_locked` flag.
- Image Viewer continues to display the architecture revision pinned at finalize time.
- Document upload disabled in lock state.
- Queue (Screen 4) and Output (Screen 5) views remain fully interactive.

---

## D-22. Share URL Revision History Model

**Status:** ✅ **CONFIRMED — Option B (`share_url_revisions` table)**

**Question:** How is the user-curated share URL revision history modeled?

**Options:**

- **A. Single `current_share_url` field on estimate, overwritten each time** [Rejected] — Loses history.
- **B. `share_url_revisions` table with timestamps and optional user notes** [Recommended / Confirmed]
- **C. Append-only log within the estimate row** [Rejected] — Worse query ergonomics.

**Recommendation (final):** **B.** Schema:

```
share_url_revisions
  id
  estimate_id (FK)
  share_url
  is_first_pass (boolean — true exactly once per estimate, for the Agent 2 row)
  created_at
  created_by (user_id)
  note (nullable, user-supplied)
```

Constraints:

- Exactly one `is_first_pass = true` row per estimate (enforced via partial unique index).
- All other rows are user-pasted, with `is_first_pass = false`.
- Revisions are append-only at the table level; users can soft-delete a revision but not edit history.

**Justification:** Clean query semantics for Screen 5's revision list. Soft-delete preserves audit trail. Partial unique index enforces the "first-pass is exactly one" invariant at the database level.

---

## D-23. Screen 5 First-Pass Disclaimer

**Status:** ✅ **CONFIRMED**

**Decision:** Screen 5 displays a persistent, prominent badge or banner clarifying the data scope. Suggested copy:

> "First-pass figures generated {date}. Refinements made directly in the AWS Pricing Calculator are not reflected in this view. Update the share URL to track new revisions."

The badge appears alongside the YoY chart and the share URL revisions list.

**Justification:** Sets correct user expectations. Without this disclaimer, users could mistake the chart for live calculator state and make decisions on stale data. Disclaimer becomes optional/conditional once D-07-ROADMAP-1 (re-scrape) lands.

---

## D-24. Re-Click Semantics on a Finalized Estimate

**Status:** ✅ **CONFIRMED — Option B (Fork into a new estimate)**

**Question:** What happens when a user attempts to start a new "Create Estimate" flow on an estimate that has already completed first-pass?

**Options:**

- **A. Disable the button permanently** [Rejected] — Too restrictive; users will iterate.
- **B. Re-enable for a *new* estimate; clicking creates a new estimate that may copy context from the prior one** [Recommended / Confirmed]
- **C. Re-enable on the same estimate, replacing the prior first-pass** [Rejected] — Destructive, breaks D-22 invariants.

**Recommendation (final):** **B.** From any view of a finalized estimate, the user has access to a "Start New Estimate from This One" action that:

- Creates a new estimate row with a new ID
- Optionally copies forward: documents, context capture entries, and the most recent Detail List proposal as conversation seed material (user opt-in via checkboxes)
- Does **not** copy share URL revisions or scraped costs (those belong to the source estimate)
- The original estimate is preserved unchanged as a historical record

**Justification:** Aligns with "first-pass is final per estimate" (D-21) while giving users a clean iteration path. Originals remain valuable as references and audit artifacts. Avoids the data-model complexity of in-place re-runs (deferred to D-13-ROADMAP).

---

## D-25. Infrastructure & Service Selection Preference

**Status:** ✅ **CONFIRMED — AWS-first preference**

**Decision:** Where there is a viable choice between an AWS-native managed service and a third-party offering, default to AWS. Departure from AWS is allowed only when a non-AWS service, library, or utility is meaningfully better for the use case (richer features, materially better DX, lower TCO, or a capability AWS doesn't provide).

**Already-confirmed AWS-leaning choices:**

- D-09 Fargate (vs. third-party container runtimes)
- D-10 SQS (vs. RabbitMQ, Redis Streams, etc.)
- D-14 Lambda for parsing (vs. third-party doc-AI services in v1)
- D-18 Bedrock (vs. OpenAI/Anthropic direct)
- D-19 CloudWatch (vs. Datadog/Honeycomb)
- D-20 Secrets Manager (vs. HashiCorp Vault, Doppler)

**Already-confirmed non-AWS choices (justified exceptions):**

- D-02 Neon (Postgres) — preferred over RDS for serverless characteristics, branching, and storyboard alignment
- D-04 Clerk — storyboard decision; mature Next.js + Organizations primitive that Cognito does not match
- Frontend hosting on Vercel — assumed default given the Next.js/AppRouter stack; revisit when revisiting hosting strategy

**Process:** New service selections during spec work must call out the AWS-native option being declined and the rationale. This is not gatekeeping — it's a documentation requirement so trade-offs are visible in the spec record.

**Captured in steering doc:** This preference is recorded as a steering doc (see new "Steering Documentation" section below).

---

## D-26. Infrastructure as Code Tool

**Status:** ✅ **CONFIRMED — Terraform**

**Question:** What IaC tool provisions all AWS resources?

**Options:**

- **A. Terraform** [Recommended / Confirmed] — User-recommended, broad multi-provider support.
- **B. AWS CDK** [Alternative] — TypeScript-native (matches the rest of the stack), AWS-native abstraction.
- **C. AWS SAM** [Rejected] — Lambda-centric, narrower scope than the workload requires.
- **D. CloudFormation directly** [Rejected] — Too verbose; CDK / Terraform supersede.
- **E. Pulumi** [Alternative] — Code-as-config in TypeScript, smaller community than Terraform.

**Recommendation (final):** **A. Terraform.** All AWS resources — VPC, S3 buckets, SQS queues, Lambda functions, Fargate task definitions, ECS services, Secrets Manager entries, IAM roles, CloudWatch metrics/alarms, Bedrock provisioning — are defined in Terraform.

**Conventions for v1:**

- Per-environment workspaces (dev, staging, prod)
- Remote state in S3 with DynamoDB lock table
- Modules organized by component (e.g., `modules/agent2-fargate`, `modules/parser-lambda`, `modules/queue`)
- CI runs `terraform plan` on every PR; `apply` gated by manual approval
- Drift detection via scheduled `terraform plan` on main

**Justification (counterpoint considered):** CDK is tempting because the rest of the stack is TypeScript and CDK constructs are AWS-native. The decision lands on Terraform because:

- User-stated preference
- Broader ecosystem if non-AWS resources ever need provisioning (Clerk, Neon, Vercel — all have Terraform providers)
- HCL is simpler to review for non-developers (auditors, security reviewers)
- Better drift-detection ergonomics out of the box

**Roadmap candidate:** If TypeScript-native IaC becomes a stronger preference (e.g., to share types with the application code, or to dynamically generate infrastructure from application metadata), Pulumi or CDK can be reconsidered. Not in scope for v1.

**Captured in steering doc:** This decision is recorded as a steering doc (see "Steering Documentation" below).

---

## D-27. Bedrock Model Selection (per agent)

**Status:** ✅ **CONFIRMED — Static model assignments for v1**

**Question:** Which Bedrock model does each agent use?

**Decision:**

- **Agent 1** → **Anthropic Claude Sonnet on Bedrock.** Conversational, RAG-heavy, generates Mermaid, proposes structured line items. Long context handling matters when retrieved document chunks are injected. Strong reasoning and instruction-following at a reasonable cost.
- **Agent 2** → **Anthropic Claude Haiku on Bedrock.** Executes declarative + imperative templates step by step; primarily structured tool-use with little open-ended reasoning. Cheaper and faster per call, which compounds over many sequential steps per estimate.

**Fallback for Agent 2 brittleness:** If a specific step type proves unreliable on Haiku, that step (only) escalates to Sonnet. Tracked via D-19 metrics (per-template success rate by model).

**Justification:** Different workloads, different model capabilities. Pinning models statically for v1 prevents user choice paralysis and gives stable cost/quality baselines for instrumentation.

### D-27-ROADMAP: User-selectable model

Optionally allow users (or org admins) to select Bedrock models per agent. Trigger condition: validated user demand, or measurable variance in output quality across model generations that warrants per-estimate experimentation.

---

## D-28. Document Upload Constraints

**Status:** ✅ **CONFIRMED — Conservative initial limits, instrumented for tuning**

**Question:** What size and count limits apply to user-uploaded supporting artifacts?

**Decision (initial v1 limits):**

| Constraint                  | v1 Limit       | Rationale |
| --------------------------- | -------------- | --------- |
| Per-file size               | 25 MB          | Covers most RFP PDFs, Word docs, mid-sized PowerPoints; deters abuse |
| Per-estimate total size     | 100 MB         | Headroom for an estimate with several large attachments |
| Per-estimate file count     | 20             | Well above realistic context bundles; protects parser throughput |
| Allowed MIME types          | pptx, xlsx, docx, pdf, md | Storyboard-defined supported formats |
| Parser Lambda memory        | 1024 MB        | Sufficient for largest expected files |
| Parser Lambda timeout       | 5 min          | Generous for OCR / chunking / embedding |

**Validation layers:**

- Client-side: file size and MIME check before requesting presigned URL (instant feedback)
- Server-side: presigned URL request validates limits against current estimate state (count + total)
- S3: bucket policy enforces per-object size cap as defense-in-depth

**Instrumentation (per D-19):** p50/p95/p99 of file size, total size per estimate, file count per estimate; parser Lambda duration and memory utilization; rejection rate by reason.

**Tuning policy:**

- If p95 file size is consistently > 15 MB or rejection rate > 5%, raise limits.
- If p95 file size stays < 5 MB sustained, lower limits to reduce parser cost.
- Limits are config values (env or remote config), not code constants — adjustable without redeploy.

**Justification:** Real usage data doesn't exist yet. Starting conservative-but-generous and instrumenting beats guessing. Limits are explicitly v1 starting points, not permanent commitments.

---

## D-29. Estimate Naming

**Status:** ✅ **CONFIRMED — User-supplied, editable**

**Decision:** Each estimate has a `name` field provided by the user at creation, with an inline-edit affordance available throughout the estimate's lifecycle (subject to D-21 lock state).

**Behavior:**

- On estimate creation (Screen 2 → Workbench transition), user is prompted for a name. Default placeholder: "Untitled Estimate". Empty submission allowed; user can name it later.
- Name is editable inline on Screen 3 (Estimate Workbench) via a click-to-edit affordance — except when workbench is locked (per D-21), in which case the name is read-only.
- Name appears as the primary identifier in:
  - Screen 4 (Queue list)
  - Screen 5 (Output / Version Control)
  - Browser tab title for the estimate routes
- Name is never required to be unique. Two estimates can share a name.

**Justification:** Names matter to humans navigating their own work; uniqueness constraints don't add value. Editable mid-flight is important because users often reframe scope as Agent 1 clarifies it.

---

## D-30. Team Membership and Audit Logging

**Status:** ✅ **CONFIRMED — Lightweight invite-based teams + comprehensive action audit log**

**Decision:** Each estimate has a Team — a set of users who have been granted access by the estimate creator. Team-based access is the v1 authorization model (no RBAC, no role hierarchy); audit logging is comprehensive at the action level.

### D-30.1 Team Model

- Each estimate has a creator (`created_by` user_id).
- The creator can invite other users to the estimate's team via Clerk invitations.
- Invited users get **edit access** equal to the creator's. No role differentiation in v1.
- Team membership lives in a `estimate_team_members` table:
  ```
  estimate_team_members
    estimate_id (FK)
    user_id (Clerk user id)
    invited_by (Clerk user id)
    invited_at
    accepted_at (nullable until accepted)
  ```
- Clerk handles the invitation flow (email, sign-in/sign-up if invitee is new).
- Authorization on every read/write: server-side check that `auth.userId` is either `created_by` or in `estimate_team_members` for the target `estimate_id`.

### D-30.2 Notifications

Team members receive notifications for the v1-relevant events:

- Estimate run completed / failed
- New share URL revision added by another team member

Delivery mechanism for v1: **email via Clerk's notification infrastructure** (or AWS SES if Clerk doesn't fit). In-app notifications are a roadmap item.

### D-30.3 Audit Log

Every team-member action against an estimate is recorded in an `estimate_audit_log` table:

```
estimate_audit_log
  id
  estimate_id (FK)
  user_id (Clerk user id)
  action_type (enum: VIEWED, CONTEXT_EDITED, DOCUMENT_UPLOADED, DOCUMENT_DELETED,
                     APPROVED, RUN_STARTED, RUN_COMPLETED, RUN_FAILED,
                     SHARE_URL_ADDED, SHARE_URL_DELETED, NAME_EDITED,
                     TEAM_MEMBER_INVITED, TEAM_MEMBER_REMOVED)
  details (JSONB — action-specific payload, e.g., share URL value, doc name, before/after for edits)
  created_at
```

The audit log is append-only. UI exposes the relevant subset on Screen 5 ("Activity" tab or similar) so teams can see who did what when.

**Per the user's intent:** No elaborate RBAC. First-pass estimate creation is open to anyone authenticated. Access to a specific estimate is extended via invite. All invitee actions are logged so trail is preserved.

### D-30.4 Out of Scope for v1

- Role hierarchies (owner / editor / viewer / commenter) → roadmap
- Per-resource permissions within an estimate → roadmap
- Activity feeds beyond the audit log → roadmap
- Real-time presence indicators (who's viewing now) → roadmap

### D-30-ROADMAP: Granular roles

Add owner / editor / viewer roles when there's evidence v1's flat model causes friction (e.g., users want to share read-only estimates with stakeholders without granting edit rights).

---

## D-31. Captcha / Bot Detection on Pricing Calculator

**Status:** ✅ **CONFIRMED — No mitigation in v1; discover during testing**

**Decision:** v1 assumes the AWS Pricing Calculator does not present captchas to Playwright sessions. If captchas are observed during testing or production:

- The affected estimate transitions to FAILED with `failure_reason = BOT_DETECTION`.
- The Fargate task captures a screenshot and DOM snapshot for diagnosis.
- Mitigation strategies (residential proxy, headful mode, manual fallback workflow) become a roadmap item with the observed evidence.

**Justification:** No evidence of captcha presence currently. Building mitigation pre-emptively is wasted effort.

### D-31-ROADMAP: Captcha mitigation

Triggered by first observed captcha. Likely path: try headful mode + small humanization delays first; if insufficient, evaluate residential proxy or manual hand-off UI.

---

## D-32. Estimate Retention

**Status:** ✅ **CONFIRMED — Retain until user-initiated deletion**

**Decision:** v1 retains estimates, line items, documents, share URL revisions, architecture revisions, and audit logs indefinitely until a team member with appropriate access deletes them. No automatic archival or expiration.

**Soft delete:** Deletes are soft (records flagged with `deleted_at` timestamp) so audit trail is preserved. Hard purge is admin-only and not exposed in v1 UI.

**Justification:** Storage costs are dominated by S3 (cheap) and Neon row-count (modest). Keeping things forever is the simplest user mental model. Retention policy can be added when actual storage costs warrant it.

### D-32-ROADMAP: Retention policy and GDPR support

Triggered by either:

- Storage costs exceeding a threshold to be defined when v1 has cost telemetry
- EU users joining the platform (currently not anticipated for v1)

Likely scope: org-configurable retention windows, automatic archival to S3 Glacier, "Delete Org and all data" admin action, data export endpoint for portability.

---

## D-33. Multi-Region

**Status:** ✅ **CONFIRMED — Single-region v1 (us-east-1)**

**Decision:** v1 deploys all infrastructure (Fargate, Lambda, S3, SQS, Secrets Manager, CloudWatch) in us-east-1. Neon database also in us-east-1 region. Estimate target region is us-east-1 (per D-07.5) — the *application's* region matching the *estimates'* region simplifies latency and reduces blast radius.

**Justification:** Lowest operational complexity for v1. Multi-region brings real costs (data residency, replication, failover testing) without v1 demand to justify.

### D-33-ROADMAP: Multi-region

Triggered by international expansion, regulatory data residency requirements, or significant latency complaints from non-US users.

---

## D-34. Export Formats Beyond Pricing Calculator

**Status:** ✅ **CONFIRMED — None in v1; rely on calculator's built-in exports**

**Decision:** v1 does not generate CSV, XLSX, CloudFormation, or other export formats. Users can export from the AWS Pricing Calculator directly using its built-in export functionality.

**Justification:** The Pricing Calculator already produces these artifacts; duplicating the capability adds engineering and maintenance burden without clear v1 value.

### D-34-ROADMAP: Native export formats

Triggered by validated user demand. Likely candidates: CSV summary of line items, CloudFormation/Terraform stub from line items, branded PDF export for client-facing deliverables.

---

# Steering Documentation (To Be Created)

The following steering docs need to be authored and placed under `.kiro/steering/` so they are automatically applied by Kiro during spec and implementation work:

| File                          | Purpose                                                                                          | Source decision |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| `aws-first-preference.md`     | Default to AWS-native services; document deviations with rationale                              | D-25            |
| `iac-with-terraform.md`       | All AWS resources provisioned via Terraform; conventions for modules, state, CI gating          | D-26            |
| `tech-stack.md`               | Locked stack: Next.js + AppRouter, TypeScript, Clerk, Neon + Drizzle, shadcn/ui, Bedrock         | D-02, D-04, D-17, D-18, plus storyboard |
| `data-model-conventions.md`   | Every domain row carries `owner_id` + `org_id`; Drizzle row-level access patterns; team checks   | D-04, D-30      |
| `agent-contract.md`           | Agent 1 → Agent 2 hybrid contract format; structured payload as source of truth                  | D-01            |
| `template-authoring.md`       | Declarative-first JSON templates with imperative escape hatches; PR review checklist             | D-08            |
| `observability-conventions.md`| Required log fields, correlation ID propagation, custom metric naming, audit log shape           | D-19, D-30.3    |
| `bedrock-model-policy.md`     | Per-agent model assignments (Sonnet for Agent 1, Haiku for Agent 2); escalation rules            | D-27            |
| `audit-and-team-access.md`    | Team-based access checks, audit log action vocabulary, notification triggers                     | D-30            |

These steering docs should be created as a follow-up step before or during the first spec. Their existence is not a v1 deliverable in itself — they're working agreements that shape every spec.

---

# Summary of Recommendations

| ID   | Decision                       | Recommendation                                                              | Status       |
| ---- | ------------------------------ | --------------------------------------------------------------------------- | ------------ |
| D-01 | Contract format                | Hybrid (structured + rendered Markdown)                                     | ✅ Confirmed |
| D-02 | Primary datastore              | Neon (Postgres)                                                             | ✅ Confirmed |
| D-03 | Document storage               | S3 + Neon metadata                                                          | ✅ Confirmed |
| D-04 | Tenancy                        | Clerk Organizations + owner/org on every row                                | ✅ Confirmed |
| D-05 | Versioning                     | User-curated share URL revisions (v1); per-run versioning is roadmap        | ✅ Confirmed |
| D-06 | Architecture file              | Agent 1 generates Mermaid; revisions tracked separately                     | ✅ Confirmed |
| D-07 | Cost data                      | One-shot Pricing Calculator scrape; per-year groups; on-demand; us-east-1   | ✅ Confirmed |
| D-08 | Template shape                 | Hybrid: declarative-first with imperative escape hatch                      | ✅ Confirmed |
| D-09 | Agent 2 runtime                | Fargate                                                                     | ✅ Confirmed |
| D-10 | Queue                          | SQS Standard + DB lock                                                      | ✅ Confirmed |
| D-11 | Status model                   | Two-layer state machine (v1 prunes STALE, SKIPPED, UPDATED)                 | ✅ Confirmed |
| D-12 | Realtime                       | Polling v1; SSE and WebSockets on roadmap with quantitative triggers        | ✅ Confirmed |
| D-13 | Idempotency                    | Run-level (v1); per-line-item hashing on roadmap                            | ✅ Confirmed |
| D-14 | Document parsing               | S3 PUT → Lambda → pgvector                                                  | ✅ Confirmed |
| D-15 | RAG                            | pgvector for user docs; Git for templates                                   | ✅ Confirmed |
| D-16 | Approval flow                  | Single gate v1 (one-shot commit); reconciliation gate on roadmap            | ✅ Confirmed |
| D-17 | Auth                           | Clerk + Organizations                                                       | ✅ Confirmed |
| D-18 | LLM provider                   | Amazon Bedrock                                                              | ✅ Confirmed |
| D-19 | Observability                  | CloudWatch + structured logs + cost metrics                                 | ✅ Confirmed |
| D-20 | Secrets                        | AWS Secrets Manager (backend), Vercel env (frontend-public only)            | ✅ Confirmed |
| D-21 | Workbench concurrency          | Lock workbench during run AND after first-pass completion                   | ✅ Confirmed |
| D-22 | Share URL revision model       | `share_url_revisions` table with `is_first_pass` flag                       | ✅ Confirmed |
| D-23 | Screen 5 disclaimer            | Persistent first-pass-only badge on Screen 5                                | ✅ Confirmed |
| D-24 | Re-click semantics              | Fork into a new estimate (preserves original)                               | ✅ Confirmed |
| D-25 | AWS-first preference           | Default to AWS-native services; document deviations                         | ✅ Confirmed |
| D-26 | IaC tool                       | Terraform with per-env workspaces and S3-backed remote state                | ✅ Confirmed |
| D-27 | Bedrock model selection        | Sonnet for Agent 1, Haiku for Agent 2 (static for v1)                       | ✅ Confirmed |
| D-28 | Document upload constraints    | 25 MB/file, 100 MB/estimate, 20 files/estimate; instrumented for tuning     | ✅ Confirmed |
| D-29 | Estimate naming                | User-supplied, editable, not unique                                         | ✅ Confirmed |
| D-30 | Team membership + audit log    | Invite-based teams, flat permissions, comprehensive action audit log        | ✅ Confirmed |
| D-31 | Captcha mitigation             | None in v1; discover during testing                                         | ✅ Confirmed |
| D-32 | Retention                      | Indefinite until user deletion (soft delete)                                | ✅ Confirmed |
| D-33 | Multi-region                   | Single-region us-east-1 for v1                                              | ✅ Confirmed |
| D-34 | Export formats                 | None native in v1; users export from Pricing Calculator                     | ✅ Confirmed |

---

# Roadmap Items Summary

Items deferred from v1 to maintain a tight scope for the first-pass Estimate → Pricing Calculator flow:

| ID                  | Roadmap Item                                                          | Trigger / Rationale |
| ------------------- | --------------------------------------------------------------------- | ------------------- |
| D-05-ROADMAP        | Multi-run estimates with merged version history                       | When iterative re-runs are introduced |
| D-07-ROADMAP-1      | Re-scrape totals on user-supplied URL update                          | User feedback or >30% of estimates accumulating multiple URL revisions |
| D-07-ROADMAP-2      | Reconciliation against AWS Price List API                             | Template success rate drops below 95% sustained, or post-mortems show silent calculator math drift |
| D-07.2-ROADMAP      | Multi-year commitments (RIs, Savings Plans, EDP discounts)            | Validated user demand from v1 usage |
| D-08-ROADMAP        | Imperative usage > 20% of total template steps signals schema gap     | Metric-driven schema evolution |
| D-11-ROADMAP        | Re-introduce STALE, SKIPPED, UPDATED states                           | Lands with D-13-ROADMAP |
| D-12-ROADMAP-1      | Server-Sent Events for realtime status                                | Concurrent runs > 50, or polling > 30% of DB read volume, or update latency > 5s |
| D-12-ROADMAP-2      | WebSockets via API Gateway                                            | Bidirectional realtime needs (collab editing, etc.), or runs > 500 sustained |
| D-13-ROADMAP        | Per-line-item hash-based idempotency for iterative runs               | When D-05-ROADMAP and D-07-ROADMAP-1 land together |
| D-16-ROADMAP        | Post-run reconciliation gate                                          | When D-13-ROADMAP lands |
| Architecture format | Richer formats (Python `diagrams` library, draw.io XML)               | v2 visual polish pass |

---

# Open Questions Still to Resolve

All previously open questions have been resolved by D-25 through D-34. This section is preserved for traceability.

1. ~~**Region(s)**~~ ✅ Resolved by D-07.5 and D-33 — us-east-1 only for v1.
2. ~~**Pricing Calculator account context**~~ ✅ Resolved by D-07.7 — anonymous estimates.
3. ~~**Captcha / bot detection**~~ ✅ Resolved by D-31 — discover during testing.
4. ~~**Estimate retention policy**~~ ✅ Resolved by D-32 — retain until user deletes.
5. ~~**Export formats beyond Pricing Calculator**~~ ✅ Resolved by D-34 — none native in v1.
