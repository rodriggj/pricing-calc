# Contract Module

The Estimate Format & Contract — the structured payload that flows between
Agent 1 and Agent 2, plus the Markdown projections rendered for human review.

## Trust Boundary

`parseEstimatePayload` is the **only** path that converts `unknown` →
`EstimatePayload`. No alternate path bypasses validation. All downstream
consumers (projection, renderers, Agent 2 wire format) accept the validated
type, so the TypeScript compiler enforces that callers pass through validation
first.

If you need to work with an estimate payload from an untrusted source (HTTP
request body, SQS message, fixture file), always call `parseEstimatePayload`
first. If it throws a `ZodError`, the input is invalid and must not be
processed further.

## Public API

| Symbol | Module | Purpose |
|--------|--------|---------|
| `parseEstimatePayload` | schema | Validate unknown → EstimatePayload (throws ZodError) |
| `safeParseEstimatePayload` | schema | Non-throwing variant (returns SafeParseReturnType) |
| `projectToPerYearGroups` | projection | Reshape per-resource → per-year-group form |
| `renderEstimateMd` | markdown | Deterministic estimate.md renderer |
| `renderArchitectureMd` | markdown | Deterministic architecture.md renderer |
| `isLegalEstimateStatusTransition` | state-machine | Status transition predicate |
| `appendAuditLogEntry` | audit-log | Append-only audit log insertion |
| `CONTRACT_SCHEMA_VERSION` | versions | Pinned schema version constant |
| `RENDERER_VERSION` | versions | Pinned renderer version constant |

## Invariants

See the design document for the full invariants table. Key points:

- **I-11**: The audit log module exposes insertion only. No update or delete
  functions are exported. The test harness structurally verifies this.
- **I-12**: `pinnedArchitectureRevisionId` must be non-null for post-DRAFT
  statuses. Enforced by Zod cross-field refinement.
- **I-5/I-6**: Renderers are deterministic and total over validated input.
