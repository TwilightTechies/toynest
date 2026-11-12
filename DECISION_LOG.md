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

## ADR-012 · Storefront browsing: URL-driven filters, extended search contract
- **Date:** 12 Nov 2026 · **Status:** Accepted
- **Context:** First post-cert phase (backlog → Storefront, "Browse core" scope). Shoppers could search but not open a product, browse by category, sort, filter by price or page through results. The database already held `attributes` and `created_at`, but the domain `Product` did not expose them.
- **Decision:**
  - `Product` gains `attributes` (string→string) and `createdAt`. `ProductSearchQuery` gains optional `sort` (relevance, price-asc, price-desc, newest, name), `minPriceMinor` and `maxPriceMinor`. They're optional, so the MCP server and the draft agent's tools are unchanged.
  - **Browsing state lives in the URL** (`/products?category=&sort=&min=&max=&page=`), submitted by a plain GET form. Every view is shareable and bookmarkable and needs no client JS. "Category pages" are this one route with `category=` set, not a second route.
  - URL params are an external boundary: `parseCatalogParams` in core validates them with Zod, converts pounds to pence, and swaps inverted bounds. Anything malformed falls back to the default instead of erroring. It lives in core because it's pure and the web app has no test runner.
  - Migration `20261112120000`: **drop and recreate** `search_products` with `sort_by`, `min_price`, `max_price`, and `attributes` and `created_at` in the result. `create or replace` can't change a return type, and adding parameters with it would leave two overloads that make PostgREST's named-argument RPC ambiguous. Every sort ends in `name, id`, so pages are stable. A separate migration adds a `price_minor` index (the migration rule: index frequently filtered columns).
  - The detail page returns 404 unless `status = 'active'`. The app still reads with the service role (ADR-011), which bypasses RLS, so `findBySlug` would otherwise serve drafts by URL. This app-level check stands in for the anon RLS policy until the auth phase.
  - The shared contract suite gains sort, paging-stability, price-range and attribute cases, so both adapters must agree. Relevance order isn't asserted across adapters (Postgres stems, in-memory doesn't).
  - Sample products get an `addedOn` date, which the in-memory adapter and the seed share, so "newest" means the same in both.
- **Alternatives:** Client-side filtering with React state (no shareable URLs, and it ships the whole catalogue); a `/categories/[slug]` route (duplicates the listing); an overloaded SQL function (ambiguous RPC); a `featured` column for the home page (deferred: needs admin editing to be meaningful).
- **Consequences:** Deferred: featured products, best sellers (needs an order aggregate), variants, personalisation. Category counts cost one count query per category (4 today). The header's category links are static and must change if categories become admin-editable. Old callers of the 4-argument function keep working, because the new parameters have defaults and the extra result columns are ignored by the old row schema.

## ADR-013 · Design foundation: semantic tokens, warm natural palette, mobile-first
- **Date:** 12 Nov 2026 · **Status:** Accepted
- **Context:** The storefront used Tailwind's default greys with no brand, and nothing was designed for phones. Cart and checkout come next, so the look should be set once now and inherited, not retrofitted page by page. The site is responsive web; no native app is planned.
- **Decision:**
  - **Warm natural** brand: cream background, deep terracotta accent, sage secondary. Fraunces for headings, Nunito Sans for body text, both self-hosted by `next/font`.
  - **Semantic tokens** in `globals.css` (`background`, `surface`, `muted`, `accent`, `sage-*`…), redefined for dark mode. Components never use raw palettes, so a palette change touches one file.
  - **Contrast is checked per token pair** (WCAG AA 4.5:1). The preview terracotta `#C2562F` reaches only 4.2:1 as text on cream, so links and buttons use `#A8461F` (5.5:1) and `#C2562F` is decorative only.
  - Primitives in `components/ui.tsx` are mostly class-string helpers (`buttonClass`, `fieldClass`…), because the same style lands on a `Link`, a `<button>` or a form button.
  - **Mobile-first:** two-column product grid on phones, a menu button with a disclosure panel, and filters collapsed behind a "Filters & sort" toggle. With the theme switch, these are the only client components; browsing stays URL- and server-driven (ADR-012).
  - **Placeholder product art** per category, drawn as inline SVG. There's no image column yet: real photos come with admin product editing and Supabase Storage.
  - **Theme switch (Light / Dark / Auto):** "Auto" (the default) follows the device. An explicit choice is stored in `localStorage` and set as `<html data-theme>` by a tiny inline `<head>` script before first paint, so there's no flash of the wrong theme. Dark tokens apply when the device prefers dark and the user hasn't chosen light, or when they've chosen dark. Tailwind's `dark:` variant follows the same rule through `@custom-variant`. `color-scheme` keeps native controls in step. A cookie was rejected: reading it in the root layout would make every page dynamic and lose the static shell under `cacheComponents`.
  - A path-scoped rule (`.claude/rules/web-ui.md`) records these conventions, so later sessions apply them when they edit web UI files.
- **Alternatives:** Figma mock-ups first (an extra round-trip; tokens make code changes cheap); a component library such as shadcn/ui (more dependencies than eight pages need); a slide-out drawer with a focus trap (more JS than a short list of links needs).
- **Consequences:** Support and admin pages inherit the colours and fonts but still use raw `zinc` classes. They move to tokens in the design polish phase. Without JS, phone users can't open the menu or filter panel, but every destination is still reachable from the footer and home page. Visual checks were done with headless Chrome at 375, 768 and 1280 px in light and dark.

## ADR-014 · India localisation: INR in paise, en-IN formatting
- **Date:** 12 Nov 2026 · **Status:** Accepted
- **Context:** ToyNest sells in India, but prices, sample orders, the support assistant and UI copy assumed the UK (GBP in pence, `en-GB`, "Under £10", a £50 refund limit). This was fixed before the cart phase so the cart is built on rupees from the start.
- **Decision:**
  - Money stays as integer minor units, now **paise** (₹1 = 100 paise). The schema already stores `currency` per row, so there's no migration. Applied migrations keep their old "pence" comments, which this ADR supersedes.
  - **One formatter:** `formatMoney` in `packages/core/src/domain/money.ts` (`STORE_CURRENCY = "INR"`, `STORE_LOCALE = "en-IN"`). It uses Indian grouping (₹1,24,999) and drops decimals for whole rupees (₹599) but shows paise otherwise, so a fractional amount is never hidden. The web catalogue and the support assistant (`case-facts.ts` re-exports it) both use it. Copy that states a limit is computed from the constant, so it can't drift (e.g. the support page's "refunds up to ₹2,000").
  - **Fresh Indian price points**, not FX conversion: ₹149–₹1,499. The home shelf is "Under ₹500". The sample orders are recomputed from the new unit prices.
  - **Support auto-refund limit ₹2,000** (was £50). The prompt tells the model that tool amounts are in paise and gives a ₹ example. The hook message is formatted with `formatMoney`.
  - URL price filters take rupees (`?max=500`, up to 7 digits, cap ₹10,00,000). The helpers are renamed to currency-neutral `majorUnits` / `formatMajorUnits`.
- **Alternatives:** Multi-currency with display conversion (no need: one market); storing rupees as `numeric` (rejected in ADR-011: rounding and conversion code); FX-converting GBP prices (gives odd price points like ₹1,429).
- **Consequences:** The live Supabase project was re-seeded. Changing the currency again would mean changing `STORE_CURRENCY` and the data; `formatMoney` already takes a currency argument. Delivery charges are not part of this ADR; they come with the cart (pincode zones).

## ADR-015 · Basket in the database, pincode-zone delivery, name personalisation
- **Date:** 12 Nov 2026 · **Status:** Accepted
- **Context:** Cart phase. Shoppers aren't signed in yet (auth is a later phase), totals must be computed server-side (CLAUDE.md), the business wants delivery charges set in the backend rather than in code, and the Name Train needs a name to engrave.
- **Decision:**
  - **Cart in the database, cart id in a cookie.** `carts` and `cart_items` tables. The browser holds only the cart id (`gen_random_uuid`, 122 random bits) in an httpOnly, `sameSite=lax`, secure-in-production cookie. The cart is created lazily on the first add, and a garbage or unknown cookie means "no basket". Every repository call is scoped by that cart id, so a line id from another basket is "not found" (the same idea as layer 3 for orders).
  - **Carts hold no prices.** A basket is priced every time it's shown by core `priceCart`, from the current product rows. Inactive or missing products are shown as unavailable and left out of totals. Prices are frozen only on order lines at checkout.
  - **Delivery by pincode zone, as data.** `shipping_zones` stores a fee, a free-delivery threshold and pincode prefixes. Core `resolveShippingZone` picks the longest matching prefix, else the single default zone (enforced by a partial unique index). Rates change without a deploy. Seeded from `data/shipping-zones.json`: Metro ₹49 (free from ₹499), North-East & remote ₹149 (free from ₹1,499), Rest of India ₹79 (free from ₹799).
  - **Personalisation is a product attribute.** `attributes.personalisation = "name"` requires a 1–20 character name (letters in any script, spaces, `. ' -`), validated by core `validatePersonalisation`. Other products reject a name. The same product with two names is two lines (`unique (cart_id, product_id, name_key)`, where `name_key` is generated from the nullable name).
  - **Atomic add:** the `add_cart_line` SQL function does insert-or-increment, capped at 10, in one statement. Double clicks can't duplicate lines or lose updates.
  - **RLS: deny by default, stated explicitly.** Restrictive `using (false)` policies on both cart tables for anon and authenticated. Only the server reads them, via the service role. Shipping zones are publicly readable. The integration test proves the public key can't read, create or change a basket even with its id, and that the security-invoker RPC is blocked too.
  - **No-JS forms:** add, quantity −/+, remove and pincode are server-action forms. `useActionState` adds inline errors. The header badge reads the cookie inside Suspense, so pages keep their static shell, and it degrades to a plain link if the database is unavailable.
- **Alternatives:** A signed cookie holding the items (no tables, but about 4 KB, no abandoned-cart record and a harder merge at sign-in); localStorage (the server only sees the basket at checkout, and that breaks server-side totals); a flat delivery rate in code (the business wanted backend-controlled, region-aware charges); weight-based shipping (every product would need a weight); a product column for personalisation (a schema change for one flag).
- **Consequences:**
  - Guest carts accumulate; they need an expiry job later.
  - Zones are edited in the database until an admin UI exists.
  - The auth phase must add an owner policy on carts, set `customer_id`, and merge the guest cart on sign-in.
  - In `next dev`, Next aborts the fetches of a discarded validation render. The logged "database unavailable" lines come from that, not from the production server (checked with `next start`: 20/20 browser checks, no errors).
