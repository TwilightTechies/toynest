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
| 1.1 | Agentic loops (stop_reason `tool_use` vs `end_turn`; avoid NL/iteration-cap termination) | Manual loop product assistant | Pending | Not started | – |
| 1.2 | Coordinator–subagent (hub-and-spoke), dynamic subagent selection, iterative refinement | Product research coordinator | Pending | Not started | – |
| 1.3 | Subagent invocation & context passing (Task tool, explicit context, AgentDefinition, parallel spawns) | Agent SDK coordinator | Pending | Not started | – |
| 1.4 | Multi-step workflows: programmatic enforcement vs prompt guidance, structured handoff | Verify-before-refund gate; human handoff summary | Pending | Not started | – |
| 1.5 | Agent SDK hooks: PostToolUse normalisation, call interception (thresholds) | Refund > threshold → escalate hook | Pending | Not started | – |
| 1.6 | Task decomposition: prompt chaining vs dynamic decomposition | Per-file + integration review passes | Pending | Not started | – |
| 1.7 | Session state: `--resume`, `fork_session`, fresh start + summary vs stale resume | Named sessions demo | Pending | Not started | – |

## Domain 2 — Tool Design & MCP Integration (18%)

| # | Task statement | ToyNest implementation | Impl | Confidence | Score |
|---|---|---|---|---|---|
| 2.1 | Tool descriptions & boundaries; splitting/renaming overlapping tools | MCP tool descriptions | Pending | Not started | – |
| 2.2 | Structured MCP errors: `isError`, errorCategory, isRetryable; empty ≠ failure | Error contract in MCP server | Pending | Not started | – |
| 2.3 | Tool distribution (4–5 per agent), scoped cross-role tools, `tool_choice` auto/any/forced | Per-agent tool sets | Pending | Not started | – |
| 2.4 | MCP integration: `.mcp.json` vs `~/.claude.json`, env var expansion, resources as catalogs | ToyNest MCP in `.mcp.json` | Pending | Not started | – |
| 2.5 | Built-in tools: Grep vs Glob vs Read/Write/Edit; incremental exploration | Used in Claude Code workflows | Pending | Not started | – |

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
| 4.1 | Explicit criteria over vague instructions; false-positive control | Review prompt criteria | Pending | Not started | – |
| 4.2 | Few-shot for consistency, ambiguous cases, extraction | Description assistant examples | Pending | Not started | – |
| 4.3 | Structured output via tool_use + JSON schema; nullable fields; enum "other"/"unclear" | Forced-tool product content | Pending | Not started | – |
| 4.4 | Validation-retry with error feedback; when retries can't help | Zod retry loop | Pending | Not started | – |
| 4.5 | Message Batches API: 50% cost, ≤24 h, no SLA, custom_id, no multi-turn tools | Bulk description design | Pending | Not started | – |
| 4.6 | Multi-instance / multi-pass review; self-review limits | Independent reviewer pass | Pending | Not started | – |

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

## Daily log

| Day | Date | Topics | Practical | Questions ✓/✗ | Notes |
|---|---|---|---|---|---|
| 1 | 1 Nov | D3: CLAUDE.md, rules, skills, hooks, permissions, plan mode | CLAUDE.md, settings.json, rule, 2 skills, hook (tested) | 7 ✓ / 3 ✗ | Exam guide verified; app scaffold + CI pending |
| 2 | 2 Nov | | | | |
| 3 | 3 Nov | | | | |
| 4 | 4 Nov | | | | |
| 5 | 5 Nov | | | | |
| 6 | 6 Nov | | | | |
| 7 | 7 Nov | | | | |
