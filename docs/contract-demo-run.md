# Contract Demo Run

Run-of-record for the **Estimate Format & Contract** spec (Task 15).

Executed on: 2026-05-14
Machine: macOS darwin arm64, 12 CPUs, Node v24.10.0

## Steps Executed

### Step 1–2: pnpm install

```
$ pnpm install
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.2s
```

### Step 3: pnpm db:migrate (idempotent)

```
$ DATABASE_URL="postgresql://estimating_app:dev_only_password@localhost:5432/estimating_app" pnpm db:migrate
Running migrations...
Migrations complete.
```

Second run (idempotent):
```
$ DATABASE_URL="..." pnpm db:migrate
Running migrations...
Migrations complete.
```

### Step 4: pnpm contract:harness

```
$ pnpm contract:harness
Fixtures: 3 / 3 validated, projected, and rendered
PBT properties: 11 / 11 passed (1024 cases each, seed=0x55a21249)
```

Exit code: 0

### Observe: out/ contents

```
$ ls out/
flat-quantity.architecture.md   sparse.architecture.md          three-year-ramp.estimate.md
flat-quantity.estimate.md       sparse.estimate.md              three-year-ramp.projected.json
flat-quantity.projected.json    sparse.projected.json
pbt-report.json                 three-year-ramp.architecture.md
```

### Confirm a: three-year-ramp.estimate.md

Year 1–5 sections present with Markdown tables. Quantities match fixture:
- ec2: 1, 2, 3, 4, 5
- lambda: 2, 4, 6, 8, 10
- dynamodb: 1, 3, 5, 7, 9

Metadata block at bottom:
```
<!-- contract-metadata
schemaVersion: v1.0.0
rendererVersion: v1.0.0
-->
```

### Confirm b: three-year-ramp.projected.json

5 groups present. Items appear in groups exactly when `quantityPerYear[k] > 0`.
All line items have non-zero quantities in all 5 years (ramp fixture), so all
groups contain all 3 items.

### Confirm c: three-year-ramp.architecture.md

Fenced mermaid block matches fixture's architecture revision:
```mermaid
graph TD
  Client[Client App] --> LB[Load Balancer]
  LB --> EC2[EC2 Fleet]
  EC2 --> Lambda[Lambda Functions]
  EC2 --> DDB[DynamoDB Tables]
  Lambda --> DDB
```

Commentary section present (fixture has non-empty `agentCommentary`):
> Serverless-first architecture with EC2 for steady-state workloads. Resources
> scale linearly year-over-year to match projected growth.

### Confirm d: Determinism check

```
$ pnpm contract:harness:verify-determinism
Determinism verification: running harness twice with same seed...
Run 1...
Run 2...
Comparing outputs...
✓ Determinism verified: both runs produced byte-identical output.
```

### Confirm e: Negative case (validators)

Edited fixture: `quantityPerYear` changed to `[1, 2, 3, 4, 5, 6]` (6 elements).

```
$ pnpm contract:harness --fixture /tmp/bad-fixture.json

Fixture validation failed: /tmp/bad-fixture.json
ZodError issues:
  - path: lineItems.0.quantityPerYear — Array must contain at most 5 element(s)
```

Exit code: 1 ✓

### Confirm f: PBT reproducibility

```
$ pnpm contract:harness --pbt-only --seed 0xCAFE
PBT properties: 11 / 11 passed (1024 cases each, seed=0xcafe)

$ pnpm contract:harness --pbt-only --seed 0xCAFE
PBT properties: 11 / 11 passed (1024 cases each, seed=0xcafe)
```

Same seed → identical case generation and identical pass/fail outcomes. ✓

## Summary

All demo script steps pass. The contract harness validates fixtures, projects
them, renders Markdown, runs 11 PBT properties at 1024 cases each, and verifies
determinism — all in under 2 seconds on the reference machine.
