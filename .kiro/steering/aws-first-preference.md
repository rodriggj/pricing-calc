# AWS-First Preference

Source: D-25 in `SA-first-pass.md`.

## The Rule

When there is a viable choice between an AWS-native managed service and a third-party offering, default to AWS. Departure from AWS requires the third-party option to be meaningfully better — richer features, materially better DX, lower TCO, or a capability AWS doesn't provide.

This is a preference, not an absolute mandate. We want trade-offs documented, not hidden.

## What "Documented Deviation" Looks Like

When a spec selects a non-AWS service, the spec's design document includes a short trade-off note in this form:

> **AWS option declined: {service name}**
>
> **Reason:** {what the third-party gives us that AWS doesn't, or why AWS is worse here}
>
> **Trade-offs accepted:** {what we lose by going off-AWS — typically vendor-management overhead, separate auth/secrets path, observability seams}

Two paragraphs is enough. The goal is auditability, not bureaucracy.

## Currently-Confirmed AWS-Native Choices

These are already locked in `tech-stack.md`. They serve as the baseline and don't need re-justification:

- AWS S3 for document blob storage
- AWS SQS for queueing
- AWS Lambda for document parsing
- AWS Fargate for Agent 2 runtime
- Amazon Bedrock for LLM access
- AWS Secrets Manager for backend secrets
- AWS CloudWatch for logs and metrics
- AWS-only deployment region: us-east-1 for v1

## Currently-Confirmed Non-AWS Choices (Justified)

These departures from AWS are accepted with rationale:

- **Neon over RDS/Aurora** — Serverless characteristics, branching for ephemeral environments, alignment with the storyboard-specified stack.
- **Clerk over Cognito** — Storyboard decision; Clerk's Next.js + Organizations primitive is significantly more mature and developer-friendly than Cognito's equivalent.
- **Vercel for frontend hosting** — Default for the Next.js / App Router stack; revisited only when hosting strategy is revisited.

## When the Preference Applies Most Strongly

The preference is strongest in these areas because data and integration costs compound:

- **Data plane.** Where customer data lives (storage, queues, databases for non-frontend data).
- **AI/ML.** LLM access, embedding generation, vector search.
- **Observability.** Where logs and metrics aggregate.
- **Identity.** Auth and secrets distribution.
- **Compute orchestration.** Container scheduling, serverless invocation.

## When the Preference Is Lighter

The preference is weaker in these areas because integration cost is low:

- Developer tooling (linters, formatters, test runners) — pick what works
- Frontend libraries (charting, date handling, form libraries) — pick what fits the use case
- Build tools — pick what the framework prefers

## Process When Adding a New Dependency

The flow lives in `tech-stack.md` but restated here for completeness:

1. Identify the AWS-native option that fits the need.
2. If selecting the AWS option, no extra documentation is required.
3. If declining the AWS option, write the two-paragraph trade-off note in the spec's design document.

If you don't know whether an AWS option exists, check before assuming it doesn't. AWS frequently has a service for what you're trying to do.

## Anti-Patterns to Avoid

- **"Vendor X has a free tier."** Free tier alone isn't a reason. AWS has free tiers too, and "free now" is "paid later."
- **"I've used Vendor X before."** Familiarity isn't a reason. Document a real trade-off.
- **"Vendor X is more popular."** Popularity isn't a reason. Document a real trade-off.
- **Implicit deviation by importing a library.** Adding a hosted third-party SDK that calls home for telemetry, auth, or anything else is an implicit non-AWS service choice. Treat it as such and document.

## When to Revisit

This preference is revisited when:

- AWS announces a new service that closes a gap a current third-party fills (e.g., Aurora Serverless v2 closes the Neon gap, then we re-evaluate).
- A confirmed third-party choice produces a meaningful incident that wouldn't have happened on AWS.
- Consolidation onto AWS produces a cost savings worth migrating for.

Revisits are tracked as decisions in `SA-first-pass.md`, not as informal updates to this steering doc.
