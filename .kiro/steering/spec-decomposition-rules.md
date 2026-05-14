# Spec Decomposition Rules

Every spec authored in this project must follow the rules below. They exist to keep specs Epic-sized, demonstrable, and chainable so we can deliver functional value at every step.

## The Eight Rules

### Rule 1: Spec size ceiling

A spec contains **no more than 15 leaf tasks**. Leaf tasks are the actually-executable items, not parent grouping nodes.

If a draft spec exceeds 15 leaf tasks, decompose it into multiple specs that flow into each other. An exception is allowed only with explicit rationale in the spec ("this is genuinely atomic and a smaller seam would be worse"), and the rationale is reviewed during spec approval.

### Rule 2: Demonstrable outcome

Every spec finishes with a human-runnable demonstration that the work delivers value. "Tests pass" alone is insufficient.

The demonstration must be observable behavior — something a person can run, see, and show another stakeholder.

### Rule 3: Spec shape declaration

Every spec declares one of three shapes in its requirements document:

- **Vertical slice** — A user-visible feature touching every layer needed to make it work (UI → API → DB → external systems). Default shape; preferred for most specs.
- **Horizontal foundation** — A non-user-facing component (parser Lambda, agent runtime, infra module) that is exercised by an explicit test harness or integration test as part of the spec's deliverables. Allowed only when downstream specs would be paralyzed without it.
- **Glue** — Connects two existing components without adding new functionality of its own. Smallest spec shape; usually under 5 tasks.

Foundation specs **require a test harness** in their task list. The harness is not optional and not deferred to a later spec.

### Rule 4: Standalone usefulness

A spec is independently testable and reviewable when complete. If it depends on future specs to be useful, mock the dependency inside the current spec rather than handing the user something that does nothing yet.

Mocks documented in the spec must be replaced by real implementations in a clearly identified follow-up spec.

### Rule 5: Acceptance criteria as user-observable outcomes

Acceptance criteria describe what a user — or a test harness, for foundation specs — can observe. They do not describe implementation steps.

Good: "User can upload a PDF and see it appear in the Documents list within 5 seconds."

Bad: "Lambda function processes the PDF and writes embeddings to pgvector."

### Rule 6: Property-based tests for invariants (mandated, soft for early specs)

When a spec defines an invariant — a property that must hold across many inputs and states — the spec includes a property-based test that exercises that invariant.

This rule is **mandated by default**. Deferring property-based testing for a specific invariant is allowed if the spec includes a documented rationale (test infrastructure not ready, invariant is trivially true by construction, etc.). Deferrals are expected to be more common in the first 2–3 specs while the testing harness is being built up, and rare thereafter.

### Rule 7: Specs decompose to other specs, not to undocumented future work

When a spec is too big and gets decomposed, every chunk produces a follow-up spec stub before the current spec is approved. We do not split specs into "and the rest is TODO."

A spec stub is a named placeholder spec with a one-paragraph problem statement, a shape declaration (Rule 3), and a placeholder for the leaf tasks. It can sit in `.kiro/specs/{name}/` until full requirements are written.

### Rule 8: Demo script

Every spec ends with a written demo script in the requirements document or its own file. The format is:

```
From a clean state:
1. Do X
2. Observe Y
3. Confirm Z
```

The demo script must be runnable by another team member without verbal hand-holding. If it can't, the spec isn't done.

---

## Spec Shapes — Quick Reference

| Shape                  | When to Use                                              | Required Deliverables                                                |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Vertical slice         | Adding user-visible capability                           | UI + API + DB + tests + demo script                                  |
| Horizontal foundation  | Component that unblocks parallel work                    | Component + test harness + integration test + demo script via harness |
| Glue                   | Wiring two existing components                           | Wiring code + integration test + demo script                         |

---

## Decomposing a Too-Large Spec

If a draft spec runs to 25 leaf tasks, ask:

1. **Are there natural seams?** Layers (UI vs API), features (auth vs upload), or integration points (Agent 1 vs Agent 2) often produce clean splits.
2. **Can a vertical slice be carved out that delivers something usable while the rest is mocked?** If yes, that becomes spec N; the mocked parts become spec N+1.
3. **Is the spec a foundation that needs to be one piece?** Confirm by asking "is the test harness exercising the whole thing meaningfully smaller than 15 tasks?" If no, the foundation is too big and needs splitting.

---

## Anti-Patterns to Avoid

- **The "infrastructure-only" spec** — Spec produces only DB tables, no observable behavior. Either combine with the spec that uses the tables, or convert to a foundation with a harness.
- **The "TODO chain"** — Spec ends with "the next spec will make this useful." Forbidden by Rule 4.
- **The "tests pass" demo** — "Demo: run `npm test`." Forbidden by Rule 2.
- **The implementation-leak acceptance criterion** — "AC: the Lambda invokes Bedrock with the chunked input." Forbidden by Rule 5.
- **The 30-task spec** — Forbidden by Rule 1; decompose.

---

## Review Checklist

Before approving a spec to start implementation:

- [ ] Leaf task count ≤15 (or rationale documented)
- [ ] Shape declared (Vertical / Foundation / Glue)
- [ ] Demonstrable outcome described
- [ ] Acceptance criteria are user-observable
- [ ] Foundations have a test harness in tasks
- [ ] PBT-mandated invariants have property-based tests (or documented deferral)
- [ ] No TODO-chain dependencies on future specs
- [ ] Demo script written and runnable
