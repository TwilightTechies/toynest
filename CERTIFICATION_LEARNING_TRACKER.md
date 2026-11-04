# CCAR-F Certification Learning Tracker

Sprint: 1–7 November 2026 · Target 4–5 focused hours/day
Source of truth: **Official Exam Guide v1.0 (July 2026)** — task statements below are verified against it.

> **Rule:** *Implementation status* and *knowledge confidence* are tracked separately.
> Shipping a feature does not count as mastering the concept. Confidence is set only
> from practice-question performance and explanation checks.

## Exam facts (verified)

| Item | Value | Source |
|---|---|---|
| Items | 60, multiple-choice + multiple-response (each item states how many to select) | Exam Guide §3 |
| Structure | **4 scenarios drawn at random from a bank of 6** | Exam Guide §3, §5 |
| Duration | 120 min (~135 min seat time) | Exam Guide / FAQ |
| Passing score | 720 scaled (100–1000), criterion-referenced | Exam Guide §10 |
| Score report | Pass/fail + scaled score + % correct per domain | Exam Guide §10 |
| Rules | Closed book, no AI/docs; NDA on all exam content | Exam Guide §13–14 |
| Eligibility | Claude Partner Network employees, company-domain email | FAQ |
| Cost | $125 USD (partner-tier discounts apply) | Exam Guide / FAQ |
| Reschedule | Guide says 24 h, FAQ says 48 h → **use 48 h** | Guide §11 vs FAQ |
| Validity | 12 months; free non-proctored recert | Exam Guide §15 |
| Retakes | 14 / 30 / 90-day waits, max 4 in 12 months | Exam Guide §12 |

### Scenario bank (4 of 6 appear) → ToyNest mapping

| # | Scenario | Primary domains | ToyNest practice |
|---|---|---|---|
| 1 | Customer Support Resolution Agent (Agent SDK, MCP tools, escalation) | D1, D2, D5 | Support assistant (Day 5) |
| 2 | Code Generation with Claude Code | D3, D5 | Repo configuration (Day 1) |
| 3 | Multi-Agent Research System (coordinator + subagents, citations) | D1, D2, D5 | Product research coordinator (Day 2) |
| 4 | Developer Productivity (Agent SDK, built-in tools, MCP) | D2, D3, D1 | MCP server + analyze-code skill (Day 3) |
| 5 | Claude Code for CI (reviews, tests, PR feedback) | D3, D4 | GitHub Actions review job (Day 1/6) |
| 6 | Structured Data Extraction (JSON schema validation) | D4, D5 | Product description assistant (Day 4) |

Status: `Pending` · `In progress` · `Done`
Confidence: `Not started` · `Low` · `Medium` · `High` (High = ≥80% on that topic's questions + can explain trade-offs unaided)

## Domain 1 — Agentic Architecture & Orchestration (27%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 1.1 | Agentic loops (stop_reason `tool_use` vs `end_turn`; avoid NL/iteration-cap termination) | `runAgentLoop` + single-agent product draft assistant (version A) | Done | Medium | 3/4 (missed: thrown tool error → `is_error` result, not a failed run) |
| 1.2 | Coordinator–subagent (hub-and-spoke), dynamic subagent selection, iterative refinement | Live coordinator demo (Claude Code subagents); Agent SDK version B coded | Done (SDK live run pending API key) | Medium | 3/4 (explaining the "why" was partial) |
| 1.3 | Subagent invocation & context passing (Task tool, explicit context, AgentDefinition, parallel spawns) | `agents` definitions with scoped tools in Agent SDK coordinator | Done (SDK live run pending API key) | Low | 1.5/3 (parallel spawning missed twice) |
| 1.4 | Multi-step workflows: programmatic enforcement vs prompt guidance, structured handoff | Verify-before-refund gate; structured `escalate_to_human` handoff (tests) | Done | Medium | 3/3 |
| 1.5 | Agent SDK hooks: PostToolUse normalisation, call interception (thresholds) | `ToolHooks` in our own loop + `refundPolicyHooks` (Agent SDK hook API not used yet) | In progress | Medium | 1.5/2 (PostToolUse timing: before Claude sees the result) |
| 1.6 | Task decomposition: prompt chaining vs dynamic decomposition | Taught only | Pending | Medium | 3/4 (open-ended "find out why" → adaptive) |
| 1.7 | Session state: `--resume`, `fork_session`, fresh start + summary vs stale resume | Taught only | Pending | Low | 1/3 (fork ≠ refresh; heavy change → fresh + summary) |

## Domain 2 — Tool Design & MCP Integration (18%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 2.1 | Tool descriptions & boundaries; splitting/renaming overlapping tools | MCP tool descriptions (purpose, boundary, input format, empty result) | Done | Medium | 4/5 (missed: describe what an empty result means) |
| 2.2 | Structured MCP errors: `isError`, errorCategory, isRetryable; empty ≠ failure | `toolError` / `guarded` error contract, tested | Done | Medium | 4.5/5 (half: hiding a timeout as `[]` is a tool fix, not a prompt fix) |
| 2.3 | Tool distribution (4–5 per agent), scoped cross-role tools, `tool_choice` auto/any/forced | Per-agent tool sets (Day 2); `tool_choice` not used (400 on current models, see exam note) | In progress | High | 5/5 with reasons |
| 2.4 | MCP integration: `.mcp.json` vs `~/.claude.json`, env var expansion, resources as catalogs | `.mcp.json` with `${VAR:-default}`; `toynest://categories` resource; `/admin/mcp` | Done (Claude Code live check pending restart) | Medium | 5/6 (resource-as-catalogue missed once) |
| 2.5 | Built-in tools: Grep vs Glob vs Read/Write/Edit; incremental exploration | Used in Claude Code workflows | Done | Medium | 4/5 (Glob `**/*` ≠ incremental exploration) |

## Domain 3 — Claude Code Configuration & Workflows (20%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 3.1 | CLAUDE.md hierarchy (user/project/directory), @import, `.claude/rules/`, `/memory` | Root CLAUDE.md | Done | Low | 1.5/3 (`@import` missed twice) |
| 3.2 | Commands & skills: project vs user scope, `context: fork`, `allowed-tools`, `argument-hint` | `new-feature`, `analyze-code` skills | Done | Low | 2/3 (missed `allowed-tools`) |
| 3.3 | Path-specific rules (`paths:` globs) vs subdirectory CLAUDE.md | `supabase-migrations.md` rule | Done | Low | 0.5/1 |
| 3.4 | Plan mode vs direct execution; Explore subagent | Used for schema/agent design | Pending | Medium | 3/3 |
| 3.5 | Iterative refinement: I/O examples, test-driven, interview pattern, batch vs sequential fixes | – | Pending | Low | 1/1 (one item only) |
| 3.6 | CI/CD: `-p`, `--output-format json`, `--json-schema`, independent reviewer, dedupe findings | GitHub Actions + Claude review | Pending | Low | 1.5/2 (self-review trap) |
| (practice) | Hooks & permissions in Claude Code (supports 1.4/1.5 concepts) | `block-main-commit` hook, deny rules | Done | Low | 0.5/1 (cal.) |

## Domain 4 — Prompt Engineering & Structured Output (20%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 4.1 | Explicit criteria over vague instructions; false-positive control | Reviewer prompt: 3 explicit categories + do-not-flag list, severity by example | Done | High | 5/5 with reasons |
| 4.2 | Few-shot for consistency, ambiguous cases, extraction | Reviewer few-shot incl. a do-not-flag case | Done | Medium | 3/4 (picked obvious examples over the ambiguous one with reasoning) |
| 4.3 | Structured output via tool_use + JSON schema; nullable fields; enum "other"/"unclear" | `submit_review` / `submit_product_draft` schemas; forced `tool_choice` not used (400 on current models) | Done | High | 4.5/5 (`"other"` needs a detail field) |
| 4.4 | Validation-retry with error feedback; when retries can't help | Quote-must-exist check with specific error → retry (tested) | Done | Medium | 4/5 (self-check fields statedTotal vs calculatedTotal missed) |
| 4.5 | Message Batches API: 50% cost, ≤24 h, no SLA, custom_id, no multi-turn tools | Design note only (overnight bulk descriptions) | Pending | High | 4/4 |
| 4.6 | Multi-instance / multi-pass review; self-review limits | `createDraftReviewer` in a fresh conversation | Done | Medium | 2/2 (few items) |

## Domain 5 — Context Management & Reliability (15%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 5.1 | Preserve critical info: case-facts block, trim tool output, lost-in-the-middle | Support assistant context builder | Pending | Not started | – |
| 5.2 | Escalation & ambiguity: explicit criteria, honour human requests, policy gaps, multiple matches | Support escalation rules | Pending | Not started | – |
| 5.3 | Error propagation across agents: structured context, partial results, coverage gaps | Coordinator error handling | Pending | Not started | – |
| 5.4 | Large codebase exploration: degradation, scratchpads, subagents, manifests, `/compact` | Explore workflows | Pending | Not started | – |
| 5.5 | Human review & confidence calibration: stratified sampling, per-segment accuracy | Admin review queue | Pending | Not started | – |
| 5.6 | Provenance: claim-source mappings, conflicts annotated, dates | Research coordinator citations | Pending | Not started | – |

## Assessment log

| Date | Assessment | Score | D1 | D2 | D3 | D4 | D5 | Weak concepts |
|---|---|---|---|---|---|---|---|---|
| 31 Oct | D3 calibration (3 Qs) | 2/3 (67%) | – | – | 2/3 | – | – | Rule loading (`@import` is eager; `paths:` rules auto-load); advisory vs deterministic reasoning. Habit: give the reason, not just the choice |
| 1 Nov | Day 1 D3 practice set (10 Qs) | 7/10 (70%) | – | – | 7/10 | – | – | `@import` loads eagerly (2nd miss); multi-select completeness (Q4 picked 1 of 2: `allowed-tools`); self-review vs independent instance (4.6) |
| 2 Nov | Day 2 lesson checks (mixed, ~14 items) | ~60% | ~65% | – | 2.5/4 | – | – | Skill scope (`~` = personal; a personal variant needs a different name); `is_error` recovery; fork vs fresh start; reasons often omitted |
| 2 Nov | Day 2 D1 practice set (10 Qs) | 9/10 (90%) | 9/10 | – | – | – | – | Q4: parallel spawning = several delegations in one coordinator response; subagents never start each other |
| 3 Nov | Day 3 lesson checks (16 items) | 13.5/16 (84%) | – | 13.5/16 | – | – | – | Empty-result wording in descriptions; resource vs tool; Glob vs Grep for exploration |
| 3 Nov | Day 3 D2 practice set (10 Qs) | 10/10 (100%) | – | 10/10 | – | – | – | None in the set; reasons not given, so confirm the "why" in mocks |
| 4 Nov | Day 4 lesson checks (15 items) | 12.5/15 (83%) | – | – | – | 12.5/15 | – | Ambiguous few-shot example with reasoning; statedTotal vs calculatedTotal; `"other"` + detail field |
| 4 Nov | Day 4 D4 practice set (10 Qs) | 10/10 (100%) | – | – | – | 10/10 | – | Reasons restated the option rather than the why |

## Daily log

| Day | Date | Topics | Practical | Questions ✓/✗ | Notes |
|---|---|---|---|---|---|
| 1 | 1 Nov | D3: CLAUDE.md, rules, skills, hooks, permissions, plan mode | CLAUDE.md, settings.json, rule, 2 skills, hook (tested); workspaces + Next.js + core + CI (PR #1, green) | 7 ✓ / 3 ✗ | Exam guide verified; Supabase env + shadcn deferred to first data/UI feature |
| 2 | 2 Nov | D1: agent loop, coordinator/subagents, hooks & enforcement, handoff, decomposition, sessions | `packages/ai` loop + tools + version A assistant; Agent SDK coordinator (version B) + Anthropic provider; `ToolHooks` + refund policy (16 tests); live coordinator demo via Claude Code subagents | 9 ✓ / 1 ✗ (practice set) | Live API runs (A vs B cost/latency) wait for a personal Console API key; branch `feat/agent-loop` not pushed yet |
| 3 | 3 Nov | D2: tool descriptions, structured errors, tool distribution & `tool_choice`, MCP config & resources, built-in tools | `apps/mcp-server` (3 tools, 1 resource, error contract, 5 tests), `.mcp.json`, `/admin/mcp` explorer, MCP_DOCUMENTATION.md, ADR-008 | 10 ✓ / 0 ✗ (practice set) | Claude Code live MCP check needs a restart + server approval |
| 4 | 4 Nov | D4: explicit criteria, few-shot, structured output, validation-retry, Batch API, independent review | `createDraftReviewer` (4 tests), `/admin/drafts/new` (writer + reviewer via server action), ADR-009 | 10 ✓ / 0 ✗ (practice set) | Live runs still wait for an API key; missing-key path verified |
| 5 | 5 Nov | | | | |
| 6 | 6 Nov | | | | |
| 7 | 7 Nov | | | | |
