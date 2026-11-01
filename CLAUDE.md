# ToyNest

E-commerce store (toys, personalised toys, stationery) and a learning project for the
Claude Certified Architect – Foundations exam. Prefer clarity and explained trade-offs over feature count.

## Layout (npm workspaces)
- `apps/web` – Next.js App Router (storefront + admin)
- `apps/mcp-server` – standalone MCP server; must never import from `apps/web`
- `packages/core` – entities, Zod schemas, ports (interfaces), domain services
- `packages/ai` – agent loops, coordinator, prompts, `AIProvider`
- `packages/adapters` – Supabase, Anthropic, MockPayment implementations of core ports
- `supabase/` – SQL migrations and seed data

## Dependency rules
- `core` imports no internal package and no vendor SDK.
- Vendor SDKs (`@supabase/*`, `@anthropic-ai/*`) are imported only in `packages/adapters`.
- Apps depend on `core`/`ai`/`adapters`; packages never import from apps.

## Commands
Node 24 (`.nvmrc`). Run from the repo root:
- `npm run dev` – web app
- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` – same steps as CI, across all workspaces
- `npm run test -w @toynest/core` – one workspace
Dependencies are pinned to exact versions; never use `^` ranges.

## Conventions
- TypeScript strict; no `any`. Validate every external boundary (HTTP, DB rows, LLM output, MCP input) with Zod.
- Prices and totals are computed server-side only.
- Supabase service-role key is server-only; never in `NEXT_PUBLIC_*` or client components.
- AI-generated content is a draft until an admin approves it.

## Workflow
- Use plan mode for schema, auth/RLS and agent-architecture changes.
- Work on a feature branch (`feat/<slug>`); never commit to `main`.
- Record architectural decisions in `DECISION_LOG.md`. Architecture overview: `docs/ARCHITECTURE.md`.
