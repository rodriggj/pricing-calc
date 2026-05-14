# First-Pass Review: Estimate-to-Pricing-Calculator Sequence Flow

![1778681263373](image/first-pass-kiro-review/1778681263373.png)

## Summary

Looking at the sequence diagram, the bones are solid. The two-agent split (creative estimation vs deterministic browser automation), async via Queue, and DDB as source of truth are all the right calls. Before we go to specs, here are the areas to mature so we don't paper over real risks.

## What's Working

- **Separation of concerns**: Agent 1 owns ambiguity and conversation; Agent 2 owns deterministic execution. Different failure modes, different scaling needs, different observability.
- **Async boundary at approval**: Queue between user-facing and Playwright work is correct. Pricing Calculator automation is slow and flaky; you don't want it on the request path.
- **Idempotency hint**: The "Has Shared URL?" branch implies updates vs creates. That's the right instinct.
- **Status note in yellow**: The observation that the binary complete/failure model is too coarse is correct and worth acting on.

## Gaps Worth Closing Before Specs

### 1. Status model is the lynchpin and currently underspecified

A simple complete/failure won't survive contact with Pricing Calculator's latency and partial failures. Proposed state machine:

```
DRAFT → AWAITING_APPROVAL → APPROVED → QUEUED → IN_PROGRESS
   → PARTIALLY_COMPLETE | COMPLETE | FAILED | STALE
```

Plus per-line-item status so the UI can show "7 of 12 resources added, 1 failed, retrying." This single decision drives the DDB schema, the frontend polling/streaming model, and Agent 2's resumability logic.

### 2. The Estimate Format Template is doing too much implicit work

The diagram shows `.md file` as both Agent 1's output and Agent 2's input. Markdown is fine for human review, but Agent 2 parsing free-form markdown reliably is where this breaks. Recommended hybrid:

- A structured payload (JSON or YAML frontmatter) that Agent 2 consumes
- A rendered markdown view for the human review step
- Both generated from the same source of truth, versioned with a schema

This also gives you a contract between the two agents you can validate independently.

### 3. Resource Templates need a clear shape

Right now "Finds Resource Template" is a black box. Two viable shapes:

- **Imperative**: per-service Playwright scripts. Maximum flexibility, maximum maintenance burden.
- **Declarative**: per-service JSON describing form selectors, field types, and value mappings, executed by a generic engine. Easier to maintain, easier to test, easier to extend with RAG.

Recommendation: push toward declarative with imperative escape hatches. This is the area most likely to rot as AWS updates the calculator UI, so building it for change matters.

### 4. Resilience strategy is missing

Playwright against a third-party SPA fails in many ways: page latency, DOM drift, captchas, expired sessions, rate limiting. The flow needs:

- Retry with backoff at the line-item level (not whole-estimate)
- Idempotency keys so retries don't duplicate resources
- Dead-letter handling for permanent failures
- Heartbeat/timeout so a stuck Playwright session doesn't hold the queue

### 5. Concurrency and runtime for Agent 2

Decisions to make explicit:

- Lambda with Playwright layers (15 min cap, fast cold start) vs Fargate (longer running, warmer pool)
- SQS FIFO per estimate (serialize line items) vs standard with locking in DDB
- Browser context isolation between concurrent estimates

### 6. User loop isn't quite closed

The diagram ends with "View Updated" but real users will want to:

- Iterate on the estimate after seeing the calculator output
- Re-run with corrections without starting over
- Cancel mid-flight

The "Shared URL in Estimate?" branch supports updates, but the user-facing affordances around revision aren't shown.

### 7. Validation gates

Two worth adding:

- Between Agent 1 and approval: schema-validate the estimate payload, sanity-check resource types exist
- After Agent 2: reconcile that what's in the Pricing Calculator matches what the estimate intended. Easy way to catch silent template drift.

### 8. Observability and cost

Bedrock tokens, Playwright minutes, and storage will be your cost drivers. Worth instrumenting from day one rather than bolting on later. Same for capturing agent reasoning traces, which you'll want when debugging template issues.

## Recommended Spec Decomposition

This is too big for one spec. Suggested separation along natural seams:

1. **Estimate Authoring** — Frontend, Agent 1, RAG, DDB schema, approval workflow
2. **Estimate Format & Contract** — template schema, validation, versioning. The contract between the two halves.
3. **Pricing Calculator Automation** — Agent 2, queue consumer, resilience, status updates
4. **Resource Template Library** — template structure, authoring guide, initial service coverage
5. **Status & Notification** — state machine, frontend updates, retry/cancel UX

The contract spec (#2) is the one to pin down first. It lets the two halves develop in parallel.

## Open Questions for the Next Pass

- Single-tenant or multi-tenant? Drives auth, isolation, and cost attribution.
- How are AWS Pricing Calculator share URLs persisted and rotated? They're public-by-default.
- What's the source of truth for AWS service/SKU metadata feeding Agent 1? Bedrock training data alone will drift.
- What's the human-in-the-loop SLA between approval and a populated calculator URL? Drives Agent 2 runtime choice.
- Are estimates versioned, or is the latest one canonical? Affects DDB schema and audit story.


---

# Second Pass: Storyboard Review

The UI/UX storyboards (Screens 1–5) don't break the sequence diagram, but they tighten several decisions and surface new requirements. This section captures what changes.

## What the Storyboards Confirm

- **Two-agent split holds.** Agent 1 lives in the Estimate Workbench (Screen 3), Agent 2 lives behind the Queue (Screen 4). Async boundary is exactly where expected.
- **Status model needs depth.** Screen 4 is a user-facing Queue with Status column showing Failed / Completed / In Progress states. This is no longer an internal SQS-only concern; it's a UX surface, which makes the richer state machine non-negotiable.
- **Hybrid format was the right call.** Screen 3's "Create Estimate" button produces *two* files: an architecture file and a Pricing-Calculator-compatible estimate file with Resources, Configurations, Quantities, and Narrative over a 5-year timeline. That's the human-readable + machine-consumable split recommended in the first pass.
- **Idempotency / versioning was the right instinct.** Screen 5 shows Version Control with multiple share URLs over time. Estimates are explicitly versioned, not overwritten.

## What the Storyboards Change

### Tech stack is now concrete and shifts some assumptions

- Clerk for auth (not Cognito)
- Next.js + TypeScript + AppRouter for frontend
- shadcn/ui for components
- **Neon (Postgres) for the database, not DynamoDB**
- Drizzle ORM

The DB shift matters. The original diagram showed DDB; Postgres is a better fit for the data shape implied by these screens — Estimate → Documents (1:M), Estimate → Versions (1:M), Estimate → Line Items (1:M), with relational queries across them. The contract spec should be updated accordingly.

Decision needed: does Neon also store document blobs, or do uploads (pptx/xlsx/docx/pdf/md) go to object storage with Neon holding metadata? S3 + Neon-metadata is the conventional split.

### Estimate Workbench is richer than the sequence diagram showed

The diagram hand-waved Agent 1 as a chat. Screen 3 reveals four distinct components:

- **Image Viewer** for uploaded architecture artifacts
- **Context Capture** for ground rules, assumptions, constraints (explicitly tagged as non-AWS attributes)
- **Detail List** — editable line items the user can edit/remove before approval
- **Agent Interaction window** for the conversational loop

The Detail List is architecturally significant. It means the user reviews and edits structured resource line items *before* approval, which is a stronger human-in-the-loop than the sequence diagram suggests. It also means the structured payload exists in DB form well before "Create Estimate" is clicked. The output `.md` file is a *render* of state that already exists in Postgres rather than a primary artifact. This simplifies the contract.

### Two output files, not one

- Architecture file
- Estimate file (Resources, Configs, Quantities, Narrative, 5-year timeline)

Open question: is the architecture file user-uploaded content reformatted, or is Agent 1 *generating* an architecture artifact (e.g., diagram-as-code, PPTX, Markdown with embedded diagrams)? Meaningful capability difference.

### Document ingestion pipeline is now explicit

Five formats supported (pptx, xlsx, docx, pdf, md). Each has different parsing strategies and different RAG implications. PPTX with embedded diagrams is the hardest case. This deserves its own slice in the spec breakdown, likely folded into Estimate Authoring.

### Year-over-Year chart on Screen 5 is new

Wasn't in the sequence diagram and it implies real *cost numbers* are needed back, not just a share URL. Three ways to get them:

1. Agent 2 scrapes totals from the Pricing Calculator after populating it
2. Compute locally using the AWS Price List API and the structured estimate
3. Both, reconciled (most robust, most work)

Pick one before specs — this changes Agent 2's responsibilities and possibly adds a third data source.

### Real-time updates become a first-class requirement

Screens 4 and 5 only work well if status updates flow back to the UI without manual refresh. Options for the Next.js app:

- Polling Neon (simplest, fine for low concurrency)
- Server-Sent Events from a Next.js route handler
- WebSockets via a separate gateway

Polling is probably enough for v1, but worth being deliberate about.

### Multi-tenancy is implied

Clerk means users and likely organizations. Every Estimate / Document / Version row needs an owner_id and (likely) org_id. This needs to land in the schema from day one rather than being retrofitted.

## New Considerations for Spec Planning

1. **Document storage and parsing pipeline** — separate concern from Agent 1's reasoning. Probably its own spec or a major slice of Estimate Authoring.
2. **Cost data acquisition** — decide between scrape, compute, or both. Affects Agent 2's contract.
3. **Versioning semantics** — what triggers a new version? Re-running Agent 2? Edits to the Detail List after a calculator URL exists? Affects schema and UI.
4. **Realtime strategy** — polling vs SSE vs WebSockets. Affects API shape.
5. **Image Viewer scope** — display only? Annotation? Generated architecture diagrams? Affects whether Agent 1 needs image-generation capability.
6. **Tenancy model** — Clerk orgs vs users-only. Affects every table and every API.

## Refined Spec Ordering

Given the new info, the original ordering is reshuffled slightly:

1. **Estimate Format & Contract** — still first; unblocks everything else
2. **Data Model & Tenancy** — Neon schema, Clerk integration, document storage. New, surfaced by the storyboards.
3. **Estimate Authoring Workbench** — Screens 1–3, document ingestion, Agent 1
4. **Pricing Calculator Automation** — Agent 2, queue, resource templates
5. **Status, Versioning & Cost Visualization** — Screens 4–5, realtime updates, YoY chart
