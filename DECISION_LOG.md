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

## ADR-004 · Ports & adapters for external providers
- **Date:** 31 Oct 2026 · **Status:** Accepted
- **Context:** Avoid coupling business logic to Supabase, Anthropic or payment vendors.
- **Decision:** `core` defines interfaces (`ProductRepository`, `OrderRepository`, `AIProvider`, `PaymentProvider`, …); `adapters` implement them.
- **Alternatives:** Call SDKs directly from route handlers (faster initially, hard to test/swap).
- **Consequences:** Slight indirection; enables mocking in tests and swapping providers.
