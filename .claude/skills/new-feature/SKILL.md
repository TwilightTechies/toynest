---
name: new-feature
description: Structured workflow for implementing a new ToyNest feature from requirement to tested code
disable-model-invocation: true
argument-hint: <feature description>
---

Implement this feature: $ARGUMENTS

1. Restate the requirement and list acceptance criteria. Ask about anything ambiguous before continuing.
2. Identify affected packages and confirm the change respects the dependency rules in CLAUDE.md.
3. Propose a step-by-step plan and wait for approval.
4. Create a branch `feat/<short-slug>`.
5. Implement in small steps. Add or update Vitest tests alongside each step.
6. Run `npm run typecheck`, `npm run lint` and `npm run test`; fix failures.
7. If the change affects architecture, add an entry to `DECISION_LOG.md`.
8. Summarise what changed, how it was verified, and anything left undone.
