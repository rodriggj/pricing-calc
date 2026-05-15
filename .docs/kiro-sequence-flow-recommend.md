# Recommended Sequence Flow

This sequence diagram incorporates the trade-off recommendations captured in `SA-first-pass.md`. It supersedes the original whiteboard flow and reflects:

- Hybrid contract (structured payload + rendered Markdown)
- Neon (Postgres) + S3 + pgvector instead of DynamoDB
- Editable Detail List with structured state living in DB before approval
- Two-layer status model (estimate + per-line-item)
- Fargate-hosted Agent 2 with declarative templates and per-item idempotency
- Local cost compute via Price List API alongside Pricing Calculator population
- Polling-based realtime updates for Screens 4 and 5

---

## Primary Sequence: Estimate Authoring → Calculator Population

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend Next.js
    participant Clerk
    participant API as API Routes
    participant S3
    participant Parse as Parser Lambda
    participant Neon as Neon Postgres pgvector
    participant A1 as Agent 1 Bedrock
    participant SQS
    participant A2 as Agent 2 Fargate
    participant TPL as Template Repo Git
    participant Price as AWS Price List API
    participant PW as Playwright
    participant Calc as AWS Pricing Calculator

    Note over User,Calc: Auth and Workspace Entry
    User->>FE: Navigate to app
    FE->>Clerk: Authenticate Clerk session
    Clerk-->>FE: User and Org context
    User->>FE: Create new Estimate
    FE->>API: POST estimates
    API->>Neon: INSERT estimate status DRAFT owner_id org_id
    Neon-->>API: estimate_id
    API-->>FE: estimate_id
    FE-->>User: Redirect to Estimate Workbench

    Note over User,Calc: Document Upload Pipeline async
    User->>FE: Upload supporting artifacts
    FE->>API: POST estimates id documents presign request
    API->>S3: Generate presigned PUT URL
    API-->>FE: Presigned URL and document_id
    FE->>S3: PUT document bytes
    S3-->>Parse: ObjectCreated event
    Parse->>S3: GET document
    Parse->>Parse: Extract text and chunk
    Parse->>Neon: INSERT document_chunks and embeddings
    Parse->>Neon: UPDATE document status PARSED

    Note over User,Calc: Estimate Workbench Loop
    loop Iterative authoring Screen 3
        User->>FE: Add context or ask question or refine
        FE->>API: POST estimates id messages
        API->>Neon: SELECT context line_items chunks for RAG
        API->>A1: Prompt plus RAG context plus tool defs
        A1-->>API: Response chat or proposed items or question
        API->>Neon: UPSERT line_items append message
        API-->>FE: Stream response
        FE-->>User: Show chat Detail List Image Viewer
        User->>FE: Edit or remove line items directly
        FE->>API: PATCH estimates id line-items
        API->>Neon: UPDATE line_items
    end

    Note over User,Calc: Create Estimate Approval Gate
    User->>FE: Click Create Estimate
    FE->>API: POST estimates id finalize
    API->>Neon: Validate schema compute hash per line_item
    API->>Price: Bulk price lookup per line_item
    Price-->>API: SKU prices and 5-year projection
    API->>Neon: Persist costs status AWAITING_APPROVAL
    API->>API: Render architecture.md and estimate.md from state
    API->>S3: Store rendered files versioned
    API-->>FE: Estimate summary and cost preview
    FE-->>User: Display review Detail List files costs

    User->>FE: Approve
    FE->>API: POST estimates id approve
    API->>Neon: UPDATE status APPROVED create estimate_version
    API->>SQS: Enqueue estimate_id and version_id
    API->>Neon: UPDATE status QUEUED
    API-->>FE: 202 Accepted
    FE-->>User: Redirect to Queue Screen 4

    Note over User,Calc: Realtime Updates Screens 4 and 5
    loop Polling every 3 to 5 seconds
        FE->>API: GET estimates id status
        API->>Neon: SELECT estimate and line_item statuses
        API-->>FE: Aggregated status
        FE-->>User: Update UI
    end
```

---

## Agent 2 Detail: Calculator Population

```mermaid
sequenceDiagram
    autonumber
    participant SQS
    participant A2
    participant Neon
    participant TPL
    participant PW
    participant Calc
    participant Price

    Note over SQS,Price: A2 = Agent 2 Fargate, TPL = Template Repo, PW = Playwright, Calc = Pricing Calculator, Price = Price List API

    SQS->>A2: Receive estimate_id and version_id
    A2->>Neon: Acquire run_lock with ttl 20min
    Neon-->>A2: Lock acquired
    A2->>Neon: UPDATE status IN_PROGRESS mark line_items PENDING

    Note over A2,Calc: Bootstrap calculator session
    A2->>Neon: SELECT existing share_url for estimate
    alt No share_url exists
        A2->>TPL: Load create-estimate template
        A2->>PW: Execute create-estimate template
        PW->>Calc: Navigate and create new estimate
        Calc-->>PW: New estimate URL
        PW-->>A2: Calculator estimate URL
        A2->>Neon: Persist working_url
    else share_url exists
        A2->>TPL: Load load-estimate template
        A2->>PW: Execute load-estimate template
        PW->>Calc: Navigate to existing share_url
    end

    Note over A2,Calc: Per line item loop with idempotency
    loop For each line_item ordered
        A2->>Neon: UPDATE line_item status IN_PROGRESS
        A2->>PW: Read current calculator state via inspect template
        PW-->>A2: Existing items and their hashes

        alt Hash matches existing item
            A2->>Neon: UPDATE line_item status SKIPPED
        else Hash differs or item absent
            A2->>TPL: Lookup resource_template for service_type
            A2->>PW: Execute add or update template with field map
            PW->>Calc: Fill form and save
            Calc-->>PW: Confirmation or error
            PW-->>A2: Result
            A2->>Neon: UPDATE line_item status ADDED UPDATED or FAILED
        end
    end

    Note over A2,Calc: Capture final share URL
    A2->>TPL: Load share template
    A2->>PW: Execute share template
    PW->>Calc: Open share dialog and capture URL
    Calc-->>PW: Public share URL
    PW-->>A2: Latest share_url

    Note over A2,Price: Local cost reconciliation
    A2->>Price: Bulk price lookup per line_item 5 year
    Price-->>A2: Authoritative cost figures
    A2->>Neon: Persist share_url costs yoy_breakdown

    Note over A2,Neon: Determine final estimate status
    A2->>Neon: Aggregate line_item statuses
    alt All items succeeded
        A2->>Neon: UPDATE estimate status COMPLETE
    else Some items failed
        A2->>Neon: UPDATE estimate status PARTIALLY_COMPLETE
    else All items failed or fatal error
        A2->>Neon: UPDATE estimate status FAILED
    end

    A2->>Neon: Release run_lock
    A2->>SQS: Delete message or send to DLQ on fatal
```

---

## Status State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> AWAITING_APPROVAL: Create Estimate
    AWAITING_APPROVAL --> DRAFT: User edits
    AWAITING_APPROVAL --> APPROVED: User approves
    APPROVED --> QUEUED: Enqueue
    QUEUED --> IN_PROGRESS: Agent 2 picks up
    IN_PROGRESS --> COMPLETE: All items succeeded
    IN_PROGRESS --> PARTIALLY_COMPLETE: Some items failed
    IN_PROGRESS --> FAILED: Fatal error
    PARTIALLY_COMPLETE --> QUEUED: User retries failed items
    FAILED --> QUEUED: User retries
    COMPLETE --> STALE: Out-of-band edit detected
    STALE --> QUEUED: User re-syncs
    COMPLETE --> [*]
```

---

## Per-Line-Item State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> IN_PROGRESS: Agent 2 starts
    IN_PROGRESS --> ADDED: New item created
    IN_PROGRESS --> UPDATED: Existing item updated
    IN_PROGRESS --> SKIPPED: Hash match idempotent
    IN_PROGRESS --> FAILED: Template error or max retries
    FAILED --> PENDING: Retry
    ADDED --> [*]
    UPDATED --> [*]
    SKIPPED --> [*]
```

---

## Component Responsibilities (Quick Reference)

| Component | Responsibility |
|---|---|
| **Frontend (Next.js)** | Auth context, Estimate Workbench UI, polling, file uploads via presigned URLs |
| **API Routes** | Auth checks, Drizzle queries, Bedrock invocation for Agent 1, queue dispatch, render projections |
| **Neon (Postgres)** | Source of truth for estimates, line items, versions, statuses, document metadata, embeddings (pgvector) |
| **S3** | Document blob storage + rendered output files (architecture.md, estimate.md) |
| **Parser Lambda** | Document text extraction, chunking, embedding generation |
| **Agent 1 (Bedrock)** | Conversational reasoning, line-item proposal, RAG over user docs |
| **SQS** | Decouples approval from Agent 2 execution; DLQ for poison messages |
| **Agent 2 (Fargate)** | Orchestrates Playwright session, executes templates, reconciles state |
| **Template Repo (Git)** | Declarative templates per Pricing Calculator screen, baked into Fargate image |
| **AWS Price List API** | Authoritative cost computation for YoY chart |
| **AWS Pricing Calculator** | External UI, populated via Playwright, source of share URLs |

---

## Mapping to Storyboard Screens

| Screen | Flow Coverage |
|---|---|
| **1. Sign-in** | Clerk auth step (top of primary sequence) |
| **2. Index + Upload** | Document upload pipeline, S3 + Parser Lambda |
| **3. Estimate Workbench** | Iterative authoring loop with Agent 1 + Detail List edits |
| **4. Queue** | Polling loop + estimate-level state machine |
| **5. Output / Version Control** | Per-version share URL + YoY costs from Price List API |

---

## What's Different from the Original Diagram

1. **Detail List edits flow into Neon directly** — no longer waits for "Create Estimate" to materialize structured data.
2. **Output files are projections, not primary artifacts** — `architecture.md` and `estimate.md` are rendered from Neon on demand and stored as versioned artifacts in S3.
3. **Agent 2 reads existing calculator state before mutating** — supports idempotency and update-vs-create flow without LLM-side branching.
4. **Cost figures come from Price List API, not the calculator** — decouples Screen 5's chart from Playwright reliability.
5. **Two-layer status (estimate + line item)** — supports targeted retry and meaningful failure messages.
6. **Document parsing is async out-of-band** — uploads don't block the user.
7. **Templates are baked into the Fargate image from Git** — versioned as code, reviewable in PRs, tested in CI.

---

# Next Step

Once trade-offs are confirmed in `SA-first-pass.md`, the recommended first spec is **Estimate Format & Contract** since it locks the schema both halves consume.
