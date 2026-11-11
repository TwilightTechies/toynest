# Decision Log

Lightweight ADRs. Each entry: context → decision → alternatives → consequences.

## ADR-001 · Certification-first sprint scope
- **Date:** 31 Oct 2026 · **Status:** Accepted
- **Context:** ~32 hours available (1–7 Nov), of which ~30% (~10 h) is implementation. Full e-commerce + three AI systems + MCP server does not fit.
- **Decision:** Build only what demonstrates the five exam domains: seeded catalogue (list/search/detail), Supabase Auth with seeded customers + admin, admin AI-draft review queue, seeded orders, product assistant (single + coordinator), MCP server, description assistant, support assistant.
- **Alternatives:** Full MVP storefront first (rejected: consumes learning time); AI features only with no app (rejected: no realistic data isolation/RBAC context).
- **Consequences:** Cart, checkout, payments, customisation uploads, full admin CRUD and dashboard move to `POST_CERTIFICATION_BACKLOG.md`.

## ADR-002 · Supabase cloud free tier
- **Date:** 31 Oct 2026 · **Status:** Accepted
- **Context:** Need Postgres, Auth and RLS quickly; no Docker requirement.
- **Decision:** Use a Supabase cloud free-tier project. Schema changes still go through versioned SQL migrations in `supabase/migrations/`.
- **Alternatives:** Local Supabase CLI + Docker (more isolated, offline; more setup).
- **Consequences:** Free projects pause after inactivity; service-role key stays server-side only, never `NEXT_PUBLIC_*`.

## ADR-003 · npm workspaces monorepo
- **Date:** 31 Oct 2026 · **Status:** Accepted
- **Context:** Web app and MCP server must share domain logic without coupling to each other.
- **Decision:** npm workspaces with `apps/web`, `apps/mcp-server`, `packages/core`, `packages/ai`, `packages/adapters`.
- **Alternatives:** Single Next.js app (MCP server would sit inside web app, violating separation); pnpm/Turborepo (better caching, extra tooling).
- **Consequences:** Package boundaries enforce dependency direction: `core` imports nothing internal; adapters implement `core` ports.

## ADR-005 · Align AI features with exam scenarios
- **Date:** 1 Nov 2026 · **Status:** Accepted
- **Context:** The official Exam Guide v1.0 draws 4 of 6 fixed scenarios. Practising in the same shapes builds transferable judgement.
- **Decision:** Support assistant mirrors Scenario 1 (MCP tools `get_customer`, `lookup_order`, mock `process_refund`, `escalate_to_human`; hook blocks refunds above a threshold). Product coordinator mirrors Scenario 3 (specialists return claim–source mappings). Description assistant mirrors Scenario 6. CI review mirrors Scenario 5.
- **Alternatives:** Original brief's tool set only (less exam coverage).
- **Consequences:** `process_refund` is mock-only, operates on synthetic data, and never moves money; refund decisions above threshold require human approval.

## ADR-006 · Claude Agent SDK for orchestration
- **Date:** 1 Nov 2026 · **Status:** Accepted; partly superseded by ADR-010 (the support agent uses ToyNest's own loop)
- **Context:** Exam Domain 1 (27%) tests Agent SDK concepts: AgentDefinition, Task-based subagents, allowedTools, hooks, sessions.
- **Decision:** Hand-write one raw Messages API loop first (task 1.1), then build the coordinator and support agent with the Claude Agent SDK (TypeScript).
- **Alternatives:** Raw API only (more code, misses SDK concepts); SDK only (hides the loop mechanics).
- **Consequences:** Extra dependency; `packages/ai` wraps the SDK behind `AIProvider` so business logic stays decoupled.

## ADR-007 · Runtime and toolchain versions
- **Date:** 1 Nov 2026 · **Status:** Accepted
- **Context:** Node 20 reached end of life (Apr 2026); Vitest 5 and jsdom 30 require Node 22+. TypeScript 7 is not yet supported by typescript-eslint (<6.1). eslint-config-next 16.4.3's bundled plugins (react, jsx-a11y, import) support ESLint ≤9.
- **Decision:** Node 24 LTS (`.nvmrc`), TypeScript 6.0.3, ESLint 9.39.5, exact-pinned dependencies.
- **Accepted risk:** 16 moderate `npm audit` findings, all from one advisory (minimatch <11 ReDoS, GHSA-g3hv-75wg-m249) in the dev-only ESLint tree. Exploitation needs attacker-controlled glob patterns; ours are fixed in config. npm's suggested fix is a breaking downgrade. Revisit when eslint-config-next supports ESLint 10.
- **Consequences:** CI uses `node-version-file: .nvmrc`. `typecheck` runs `next typegen` first because Next 16 generates route types (e.g. `LayoutProps`).

## ADR-004 · Ports & adapters for external providers
- **Date:** 31 Oct 2026 · **Status:** Accepted
- **Context:** Avoid coupling business logic to Supabase, Anthropic or payment vendors.
- **Decision:** `core` defines interfaces (`ProductRepository`, `OrderRepository`, `AIProvider`, `PaymentProvider`, …); `adapters` implement them.
- **Alternatives:** Call SDKs directly from route handlers (faster initially, hard to test/swap).
- **Consequences:** Slight indirection; enables mocking in tests and swapping providers.

## ADR-008 · Read-only ToyNest MCP server over stdio
- **Date:** 3 Nov 2026 · **Status:** Accepted
- **Context:** Exam Domain 2 (task statements 2.1–2.4) and Scenario 4 cover MCP tool design, structured errors, resources and `.mcp.json`. The catalogue should be usable by any Claude client, not only our own agent loop.
- **Decision:** `apps/mcp-server` serves `get_categories`, `search_products`, `get_product` and the `toynest://categories` resource over stdio, reading through the core repository ports. Failures return `isError` with `errorCategory` and `isRetryable`; empty results are successes. It is configured in the project-scope `.mcp.json` with `${VAR}` expansion and no secrets. The admin MCP explorer spawns it and calls it over stdio rather than importing its code.
- **Alternatives:** Streamable HTTP transport (needed for remote clients, adds auth and hosting work); importing the server into the web app (couples two apps).
- **Consequences:** Read-only means no write tools until admin auth and approval exist. Spawning per request is slow (about 1 s) but acceptable for a local admin tool.

## ADR-009 · Independent draft reviewer with explicit criteria
- **Date:** 4 Nov 2026 · **Status:** Accepted
- **Context:** Exam Domain 4 (task statements 4.1–4.4 and 4.6). Self-review in the writer's own conversation tends to agree with itself, and vague review prompts produce noisy findings that admins learn to ignore.
- **Decision:**
  - `createDraftReviewer` runs in a fresh conversation that sees only the brief and the draft.
  - It flags three explicit categories (invented fact, age mismatch, price in text), with severity defined by example and few-shot cases that include something not to flag.
  - It returns structured output through a `submit_review` tool, and code checks that every quoted phrase is really in the draft, sending specific errors back for a retry.
  - It doesn't use forced `tool_choice` (rejected with a 400 on current models when thinking is on); the stop-reason loop and the tool's validation give the same guarantee.
  - `/admin/drafts/new` loads the key from the root `.env.local` on the server only.
- **Alternatives:** Self-review in the writer's own conversation (cheaper, but it agrees with itself); a single combined writer and reviewer prompt; forced `tool_choice` (what the exam teaches, but unsupported here).
- **Consequences:** Each run costs two conversations. Findings below 0.7 confidence are marked for a second look. A "tone" category is deliberately left out so precision stays high.

## ADR-010 · Support assistant on ToyNest's own loop, with case facts and isolation layers
- **Date:** 6 Nov 2026 · **Status:** Accepted
- **Context:** Exam Domain 5 (task statements 5.1–5.3) and Scenario 1. A multi-turn support chat must keep exact amounts and dates over a long conversation, escalate on explicit criteria, report failures in a form the agent can act on, and never expose one customer's data to another. The existing `refundPolicyHooks` were written for `runAgentLoop`.
- **Decision:**
  - The support assistant runs on `runAgentLoop`, not the Agent SDK. The loop gains `history`, `priorCalls` and `toolCalls`; `combineHooks` merges hook sets.
  - Conversation state stays on the server. Each turn sends a `<case_facts>` block, built by code from validated tool results, plus only the last 6 chat turns verbatim. Tool results are trimmed to a support view.
  - Isolation: (1) the customer id comes from the session and repository methods are always scoped to a customer; (2) a PreToolUse hook blocks foreign customer ids and refunds on orders not looked up first; (3) a PostToolUse hook withholds any result that contains another customer's id. Layer 4 will be Supabase RLS.
  - Tools throw `ToolError` with `errorCategory` and `isRetryable`. "Could not check" (transient) is kept separate from "not on your account" (business).
  - Escalation criteria and borderline examples live in the system prompt. The £50 limit, verification and ownership rules are enforced by hooks and tool code.
- **Alternatives:** Agent SDK with SDK hooks and sessions (follows ADR-006 and practises sessions, but the SDK keeps the full history, which hides the case-facts design, and the hooks would need porting); sending the full transcript every turn (simpler, but it grows without limit and buries facts in the middle).
- **Consequences:** The web demo uses a mock "sign in as" cookie and an in-process conversation store, so conversations are lost on restart. Supabase Auth and tables replace both later (Build B). Orders older than 6 turns are known only through case facts, so case facts must record every fact the agent may need again.

## ADR-011 · Supabase persistence, RLS as isolation layer 4, Postgres full-text search
- **Date:** 10 Nov 2026 · **Status:** Accepted
- **Context:** Catalogue and support data came from JSON files behind the core repository ports. Build B adds the real database. The migration rule said money is `numeric(10,2)`, but the domain has always used integer pence.
- **Decision:**
  - Money is stored as `integer` minor units (pence) with `>= 0` checks, the same as the domain, so the adapter has no rounding conversions. The migration rule is updated to match.
  - Seven one-concern migrations (`supabase/migrations/`): categories, products, customers, orders, order_items, a shared `updated_at` trigger, and a `search_products` function. RLS is enabled on every table. There are no write policies, so only the server (service role) writes.
  - **Isolation layer 4 = RLS:** a signed-in user can read only their own customer row, orders and order lines. Anonymous visitors can read only active products and the categories. This is proven by an integration test that signs in two throwaway users with the public key. It includes the case where the repository is asked for another customer's id, so layer 4 holds even if layer 3 is bypassed.
  - **Full-text search:** a stored, generated `tsvector` (english stemming; name weighted above description) with a GIN index. `search_products` builds a prefix OR query from the stemmed words: "wood" finds "wooden", "puzzles" finds "puzzle", user punctuation can't break the query, and name matches rank first.
  - Adapters receive a Supabase client; the composition root (`apps/web/src/lib/data.ts`) chooses the key. Today it uses the **service role, server-side only**, with every order query scoped to the session's customer id (layer 3). When real Supabase Auth replaces the mock sign-in, the composition switches to a user-scoped client and RLS applies to the app's reads as well.
  - The app falls back to the sample JSON when Supabase isn't configured. The seed script loads the database **from the same JSON**, so a shared contract test suite can check both adapters against one set of expectations.
  - The CLI comes from npm (pinned devDependency): `link` + `db push`, no Docker needed.
- **Consequences:** No vendor code outside `packages/adapters` (`@toynest/adapters/supabase` is a separate export, so the MCP server doesn't load supabase-js). The MCP server stays on the sample JSON for now, as a credential-free stdio server. Until real auth exists, the running app relies on layer 3 for order isolation; layer 4 is enforced in the database and tested, but bypassed by the service-role key. Search semantics match the in-memory adapter (any word), except that Postgres adds stemming, which in-memory substring matching doesn't have.
- **Alternatives considered:** `numeric(10,2)` (rejected: conversion code and rounding edge cases); wiring real sign-in now (deferred to the auth phase, about twice the scope); `ILIKE` search (no stemming or ranking, and no index for leading wildcards); pasting SQL into the dashboard by hand (no record of which migrations have run).
