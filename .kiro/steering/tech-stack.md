# Tech Stack

Locked technology choices for v1. Source decisions referenced in `SA-first-pass.md`.

When a spec proposes deviating from any of these, it must call out the deviation and rationale in its design document. This is documentation, not gatekeeping — we want trade-offs visible.

## Core Stack

| Layer                | Choice                                                | Source        |
| -------------------- | ----------------------------------------------------- | ------------- |
| Frontend framework   | Next.js with App Router                               | Storyboard    |
| Language             | TypeScript                                            | Storyboard    |
| UI components        | shadcn/ui                                             | Storyboard    |
| Authentication       | Clerk (with Organizations enabled)                    | D-04, D-17    |
| Database             | Neon (Postgres) with pgvector extension               | D-02          |
| ORM                  | Drizzle                                               | Storyboard    |
| Document storage     | AWS S3 (metadata in Neon)                             | D-03          |
| Queue                | AWS SQS (Standard) with Neon-based estimate locking   | D-10          |
| Compute (Agent 2)    | AWS Fargate                                           | D-09          |
| Compute (parsing)    | AWS Lambda                                            | D-14          |
| LLM provider         | Amazon Bedrock                                        | D-18          |
| Secrets              | AWS Secrets Manager (backend); Vercel env (frontend)  | D-20          |
| IaC                  | Terraform (per-env workspaces, S3-backed remote state) | D-26         |
| Observability        | AWS CloudWatch (logs + custom metrics)                | D-19          |
| Frontend hosting     | Vercel                                                | Storyboard    |
| Region               | us-east-1 (single region for v1)                      | D-33          |

## Bedrock Model Assignments

Models are pinned per agent for v1. User-selectable models is on the roadmap.

| Agent     | Model                                | Rationale                                                                           |
| --------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| Agent 1   | Anthropic Claude Sonnet on Bedrock   | Conversational, RAG-heavy, generates Mermaid, proposes structured line items        |
| Agent 2   | Anthropic Claude Haiku on Bedrock    | Mostly structured tool-use; cheaper and faster per call across many sequential steps |

**Escalation:** If a specific Agent 2 step type proves unreliable on Haiku, that step (only) escalates to Sonnet. Tracked via per-template success-rate metrics.

## Versioning & Pinning

- Node.js: latest LTS at project start
- Next.js: pin to a specific minor version per environment
- Drizzle: pin to a specific minor version
- Terraform: pin AWS provider to a specific major version
- Bedrock model versions: pin model IDs explicitly (e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0`); upgrades are deliberate, not implicit

## Provider Abstractions

- **LLM provider abstraction.** Agent code does not call Bedrock directly with hardcoded model IDs scattered across files. A thin provider abstraction (`getModel('agent1')`, `getModel('agent2')`) reads from config so swapping providers or model versions is a config change.
- **Object storage abstraction.** S3 access goes through a small adapter so tests can inject an in-memory or local-FS backend without touching network.
- **Queue abstraction.** SQS access is wrapped so tests can use an in-process queue.

## What's Not in the Stack (v1)

These are explicitly out of scope. If a spec needs one, it must call out the addition and rationale.

- Vector DBs other than pgvector
- Third-party doc-AI services (Unstructured, LlamaParse) — roadmap fallback per D-14
- Observability vendors (Datadog, Honeycomb) — roadmap per D-19
- Multi-region deployment — roadmap per D-33
- Native export formats (CSV, XLSX, CloudFormation) — roadmap per D-34
- RBAC frameworks (Casbin, OPA) — D-30 chose flat team-based access

## Adding a New Dependency

When proposing a new library or service:

1. Confirm there isn't an AWS-native option that fits (per `aws-first-preference.md`).
2. If yes-AWS option exists and is being declined, document why in the spec.
3. Pin the new dependency to a specific version in `package.json` (no open ranges).
4. If it's an LLM-related dependency, confirm it works through the provider abstraction.
