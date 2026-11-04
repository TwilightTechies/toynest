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
- **Date:** 1 Nov 2026 · **Status:** Accepted
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
