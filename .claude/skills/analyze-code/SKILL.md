---
name: analyze-code
description: Explain unfamiliar ToyNest code - its purpose, data flow, dependencies and risks - without modifying files. Use when asked how some part of the codebase works.
context: fork
agent: Explore
argument-hint: <file, folder or question>
---

Analyse: $ARGUMENTS

Report back concisely:
- Purpose: what this code is responsible for.
- Entry points and data flow, with `file:line` references.
- Dependencies, and whether they respect the package dependency rules in CLAUDE.md.
- Risks: security, missing validation, coupling, missing tests.
- Open questions you could not answer from the code.
