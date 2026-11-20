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
- **Amended 19 Nov 2026 (user request):**
  - **Light is the default theme.** The server renders `<html data-theme="light">` (so it also holds without JS). Choosing Dark stores `dark`. Choosing Auto now stores `system` explicitly and removes the attribute, so the device decides. Choosing Light clears storage. A shopper who had picked Auto before this change (nothing stored) now gets light. `theme-color` is the light background only.
  - **Mobile fixes from a CDP audit** (360/390/768/1280 px, touch emulation, 10 pages plus menu, filters, basket and checkout):
    - fields and medium buttons are 44 px tall;
    - small controls grow to 44 px on touch screens only, via Tailwind's `pointer-coarse:` variant: basket −/+ and Remove, footer links, pagination, the theme switch, back links and breadcrumbs (`touchLinkClass`). Mouse layouts keep their density;
    - fields use 16 px text on phones, because iOS Safari zooms the page into any input under 16 px;
    - the support page's customer `<select>` no longer overflows at 360 px (`min-w-0`);
    - at tablet width the filter form wraps to two rows instead of squashing Category and Sort;
    - on phones the checkout summary comes first, so the total is seen before "Place order".

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

## ADR-016 · In-app admin: Supabase Auth sign-in, admin role in the database, product catalogue editing
- **Date:** 13 Nov 2026 · **Status:** Accepted
- **Context:** The catalogue could only change through seed files, and `/admin` had no login. Products are commerce data (paise prices, draft → active → archived, AI drafts that need human approval, RLS), not editorial content.
- **Decision:**
  - **No external CMS.** The admin is part of the Next.js app and writes through `core`. A CMS (Payload, Strapi, Directus) would either keep a second copy of products or write to Postgres around the domain rules. A CMS may still be added later for editorial pages (banners, guides) only.
  - **Supabase Auth with email and password.** `@supabase/ssr` keeps the session in cookies, and the adapter forces them to be `httpOnly`, `SameSite=Lax` and `Secure` in production. The vendor SDK stays in `packages/adapters`: the web app passes in a cookie jar (`getAll`/`setAll`).
  - **The admin role is a table (`admin_users`) plus `public.is_admin()`** (`security definer`, `search_path = ''`, executable by `authenticated` only). This was chosen over a JWT `app_metadata` claim so that removing a row revokes access on the next request, not when the token next refreshes. Only the service role writes the table, through `npm run admin:create -w @toynest/adapters -- <email>` (the password is typed with hidden input, never passed as an argument).
  - **Two independent checks:**
    - *Layer 3:* `requireAdmin()` runs in the admin layout **and** in every admin page and server action. A layout check alone isn't enough, because pages render in parallel with it and a server action is a public POST endpoint.
    - *Layer 4:* admin reads and writes use a **user-scoped client** (anon key plus the admin's JWT), and RLS policies `using/with check (public.is_admin())` refuse them for anyone else. There is no delete policy: products are archived, never deleted, because cart and order lines reference them.
    - `proxy.ts` (Next 16's middleware) only refreshes the session and redirects signed-out visitors. It is not a security check.
  - **A separate write port, `ProductAdminRepository`.** `ProductRepository` stays read-only for the storefront.
  - **`createProductAdminService` in core holds the rules:**
    - New products, including ones saved from an AI draft, start as **drafts**.
    - **Publishing** needs a price above ₹0 and every `requiredAttributes` key of the category, and a live product can't be edited into breaking that rule.
    - Status moves are fixed: publish, unpublish, archive, and restore (which returns the product to draft).
    - Expected failures (`invalid`, `conflict`, `slug_taken`, `not_found`) are returned as values, so the form can show each one.
  - **Optimistic concurrency.** The form carries the row's `updated_at` **exactly as Postgres returned it** (an opaque version token: a JS `Date` keeps milliseconds, Postgres microseconds), and the update matches `id` **and** `updated_at`. Zero rows means someone saved in between, so the admin sees a conflict and nothing is overwritten.
  - **Prices are typed in rupees** and parsed with integer arithmetic (`parseRupees`: commas allowed, at most 2 decimals, up to ₹10,00,000), then stored in paise.
  - **Shoppers see edits immediately.** Cached catalogue reads carry `cacheTag("catalog")`, and each admin write calls `updateTag("catalog")`.
- **Alternatives:** Payload CMS (best Next.js fit, but it owns its own schema and migrations); Directus (an instant admin over Postgres, but a separate service whose writes skip the domain rules); Refine or React-admin with the Supabase browser client (would put a vendor SDK in client components); a shared admin password in an env var (no identity, no revocation, no audit); a JWT role claim (revocation is delayed by up to the token's lifetime); the service role for admin writes with only an app check (one missed check would be a full bypass).
- **Consequences:**
  - The admin needs Supabase with `SUPABASE_ANON_KEY`; in sample-data mode it isn't available.
  - Seeded categories require attributes the seeded products don't have yet (Educational toys: `learningFocus`; Personalised toys: `personalisationOptions`), so editing those live products asks for them first.
  - Public sign-up should be turned off in the Supabase dashboard until the customer-auth phase. Sign-ups can't gain admin rights, but there is no reason to allow them.
  - Checked with `next start`: 21/21 browser checks, including a signed-in **non-admin** posting the real Archive action past the proxy (refused by `requireAdmin`), plus 8 live adapter tests that prove the RLS layer on its own, the stale-version conflict and immediate revocation.
  - Next admin phases: images (Supabase Storage), categories, stock, shipping zones, then orders and a dashboard after checkout.

## ADR-017 · Product photos: Supabase Storage, resized once at upload, up to 8 per product
- **Date:** 13 Nov 2026 · **Status:** Accepted
- **Context:** Admins couldn't add photos, so the shop showed placeholder art. The product page needs several photos. Photo hosting must stay within the Supabase free plan for now: 1 GB storage, 5 GB uncached plus 5 GB cached egress a month, and no Supabase image transformations.
- **Decision:**
  - **Where things live:**
    - **Files go in Supabase Storage**, in a public bucket `product-images`. Not in the database, where files would eat the 0.5 GB limit and slow backups. Not on the server's disk, which hosts wipe on deploy and don't share between instances.
    - **The database keeps only details** in `product_images`: product, storage path, alt text, position, width and height.
  - **Resize once, at upload, with `sharp`** (0.35.5, behind a core `ImageProcessor` port):
    - The file's real format decides (JPEG, PNG or WebP only), never its name or MIME header.
    - EXIF rotation is applied and all metadata stripped, including GPS.
    - Limits: at least 400 px on the short side, at most 40 MP decoded (protection against decompression bombs).
    - Two WebP renditions: large (1600 px longest side, quality 80) and small (480 px).
    - This avoids paid Supabase transformations and Next's image optimiser. The shop uses plain `<img srcset>` over the two files.
  - **Immutable files** at `<productId>/<imageId>-large.webp` / `-small.webp`, served with `Cache-Control: max-age=31536000`, so repeat views count as cheaper cached egress. The bucket itself only accepts `image/webp` up to 2 MB.
  - **Limits in the database, not only the app:**
    - `position` has `check 0..7` and is unique per product (deferrable), which caps a product at 8 photos.
    - `reorder_product_images()` (`security invoker`) rewrites positions in one statement and rejects a stale id list.
    - Positions stay contiguous after deletes.
  - **RLS:**
    - Shoppers can read photo rows only for **active** products.
    - Only admins (`is_admin()`) may write rows, or upload and delete objects in the bucket (policies on `storage.objects`).
    - Admin photo writes use the user-scoped client from ADR-016.
  - **Keeping Storage and the database consistent:**
    - Upload writes the files, then the row, and deletes the files if the row fails.
    - Delete removes the row first (the photo leaves the shop at once), then the files. A failed file delete is logged as an orphan.
  - **Alt text is required.** It defaults to "<name>, photo N" and is editable per photo. Card images use `alt=""` because the card's link already names the product.
  - **Upload size:** up to 5 MB per file, uploaded one file per server-action call (`serverActions.bodySizeLimit: "6mb"`). The client uploader shows progress; without JS, a plain form uploads one file.
  - **Product page gallery:**
    - A CSS scroll-snap track (swipe needs no JS), with `#photo-N` anchor thumbnails.
    - A small client component makes the thumbnails scroll sideways only and sets `aria-current`.
    - The first photo loads eagerly with high fetch priority. Products without photos keep the placeholder art.
- **Alternatives:** Supabase image transformations (not on the free plan; per-image cost on paid plans); `next/image` (would re-optimise files that are already sized, which on a host counts against its quota); bytea in Postgres (database size, backups); signed upload URLs direct from the browser (no server-side format check before storage, and more client code); a single `image_url` column (only one photo).
- **Consequences:**
  - Size check, worst case: a detailed 4.6 MB, 12 MP image became 982 KB large plus 75 KB small. Typical product shots on plain backgrounds are much smaller. At ~200 KB per product page view, 5 GB of uncached egress is roughly 25,000 views a month before the CDN cache helps.
  - Sample-data mode has no photos.
  - Orphaned files need a cleanup job later.
  - Free projects pause after a week of inactivity.
  - Checked with `next start`: 16/16 browser checks (upload 3, alt edit, reorder, delete, an oversized and a fake file rejected, gallery thumbnails, product card) and 6 live adapter tests (Storage RLS, the database cap, public URL headers, compensation).

## ADR-018 · Category management: show/hide (seasonal ranges), menu order and labels, admin-only writes
- **Date:** 13 Nov 2026 · **Status:** Accepted
- **Context:** The shop is adding Christmas decorations. A category could only be added with SQL, the header menu was hard-coded, and hiding a seasonal range meant archiving each product.
- **Decision:**
  - **New columns on `categories`:** `visible` (Show in shop), `sort_order` and `menu_label` (a short header label). Existing rows were numbered in the order they were added, and the seeded categories keep their old short labels ("Educational", "Personalised").
  - **A hidden category hides its products everywhere in the shop without changing their status**, so a range can be switched off in January and on again in November:
    - `search_products` joins visible categories (listing, search, filters, home);
    - the shop's `CategoryRepository.list()` returns shown categories only, so the product page returns "not found";
    - the basket marks those lines "no longer available", keeps their names and leaves them out of the total;
    - add-to-basket refuses them;
    - public RLS on `categories` and `products` (and therefore `product_images`) requires `visible`, as defence in depth.
  - **A separate `CategoryAdminRepository`** (user-scoped client) sees hidden categories, so products can be prepared before launch. `ProductAdminService` receives it, because its `list()` has the same shape.
  - **New categories start hidden and go last.** The slug is fixed after creation, because it's in shop URLs. Required details are typed as labels and stored as keys ("Learning focus" → `learningFocus`), with at most 10. Adding a required detail never unpublishes anything; the category page lists how many live products are missing it.
  - **Delete only an empty category.** The foreign key refuses otherwise, and the UI suggests hiding it.
  - **Optimistic concurrency** on the raw `updated_at`, as in ADR-016.
  - **The header menu comes from the database** (`getMenuCategories`: `"use cache"` + the `catalog` tag), so it stays in the static shell and updates after an admin edit. Because the number of links now varies, the inline menu starts at `xl` (1280 px) instead of `lg`, with `whitespace-nowrap`; below that, the menu button is used.
  - The AI draft tools and MCP `get_categories` use the shop port, so hidden categories aren't offered to the model.
- **Alternatives:** Archiving each seasonal product (loses which ones were live, and it's slow); a `starts_at`/`ends_at` schedule (useful later, but more than a switch is needed now); a hard-coded menu (needs a deploy for each new category); editable slugs (break links, and would need redirects).
- **Consequences:**
  - The Supabase contract tests now check seeded data only, so admin-added products and categories don't break them.
  - The seed script leaves `visible`, `sort_order` and `menu_label` alone, so re-seeding keeps admin choices.
  - A shown category with no live products gives an empty listing; hide it until products are ready.
  - Checked with `next start`: 15/15 browser checks (create hidden → show → menu, product page and basket → reorder → hide → basket unavailable → stale version → delete refused, then allowed), and 5 live adapter tests.

## ADR-019 · Checkout: guest orders with frozen prices, mock online payment and Cash on Delivery
- **Date:** 13 Nov 2026 · **Status:** Accepted
- **Context:** Baskets couldn't become orders. The shop needs a delivery address, a payment step and a record of what was bought at what price. No real money moves yet; customer accounts come in the auth phase.
- **Decision:**
  - **Guest checkout.** `orders.customer_id` becomes nullable. A guest order stores the contact details (name, email, Indian mobile normalised to 10 digits) and the address (state or UT from a fixed list of 36, pincode). A check requires either a customer or those guest details.
  - **Prices are frozen and computed on the server only.** Checkout re-reads the basket and current products and prices them with core `priceCart`, the only pricing function. It stores each line's unit price, name, slug and personalisation, plus the subtotal, delivery, total and zone name. No price is read from the form: a forged `price` field is ignored. A database check makes the total equal subtotal plus delivery. If any line is unavailable (archived, or in a hidden category via the shared core `markNotForSale`), the shopper goes back to the basket.
  - **Atomic order creation.** `place_order(payload)` writes the order and its lines in one transaction and numbers it from `order_number_seq`, which starts at **TN-20001**. The order-number format widens to `TN-` plus 4–8 digits in the database, the domain, the adapters and the support tool. Only the service role may execute it.
  - **Idempotency:**
    - Each checkout page view carries a random token, and `orders.checkout_token` is unique. A double submit, or two simultaneous requests, gives one order: the function catches the unique violation and returns the winner's id.
    - A partial unique index allows only one open payment attempt per order (`started` / `pending`).
    - Paying an order that is already paid doesn't charge again.
    - Payment moves are conditional on the current `payment_status`, so a late "failed" can't undo a payment that succeeded.
  - **Payment:**
    - A `PaymentProvider` port with a stateless `MockPaymentProvider`; the outcome and time are encoded in the reference. A labelled test panel picks success, decline or "bank pending", and pending settles on a status check at least 5 seconds later.
    - Every attempt is recorded in `payments` (server-only; admins can read it).
    - **Cash on Delivery** up to ₹10,000 (`COD_MAX_MINOR`): the order is placed at once as `cod_due`.
    - A failed online payment keeps the basket and offers Try again or Pay on delivery instead.
    - The basket and its cookie are cleared once an order is settled.
  - **New statuses:** `awaiting_payment` on orders, plus `payment_status` (pending, paid, failed, cod_due).
  - **The confirmation page uses the order's random uuid** (a capability URL until accounts exist). Guest orders and payments are invisible to the public RLS roles.
  - **Read-only `/admin/orders`** through admin RLS `select` policies, with an index on `placed_at`.
- **Alternatives:** Creating a customer row per guest email (anyone typing someone else's email would attach orders to that person's record); pricing in SQL (a second pricing implementation to keep in step); one order row per payment attempt (duplicate orders); a real gateway now (keys, webhooks and a merchant account, which belong to a later phase behind the same port).
- **Consequences:**
  - Orders left in `awaiting_payment` need a cleanup job.
  - Order emails need the notification provider.
  - Admins can't change status yet.
  - The auth phase must link guest orders to accounts, for example by verified email.
  - The `20261113150000_add_checkout_orders` migration bundles several closely linked changes. It was applied before the project's "one concern per migration" rule was in place, so it's left as is rather than rewriting migration history. Later migrations follow the rule (e.g. the separate `orders_placed_at` index).
  - Checked with `next start`: 17/17 browser checks, run twice (validation, COD, online success, decline then retry, pending then check status, double submit, COD limit, unavailable item, forged price, admin list), and 6 live adapter tests (atomic and idempotent under concurrency, numbering, a total that doesn't add up, one open attempt, conditional moves, RLS).

## ADR-020 · Hosting on Vercel (Hobby) with Supabase
- **Date:** 15 Nov 2026 · **Status:** Accepted
- **Context:** The user wants ToyNest online. Vercel is the natural host for Next.js and offers a free Hobby plan. A few things in the code only worked on a developer's machine.
- **Decision:**
  - **Vercel Hobby with Supabase Free** while ToyNest is a learning project. Hobby is personal and non-commercial only, so selling for real means moving to Pro. The steps are in `docs/DEPLOYMENT.md`.
  - **Photo uploads fit Vercel's 4.5 MB request-body limit,** which applies on every plan:
    - the server limit (`MAX_UPLOAD_BYTES`) drops to 4 MB, with a `serverActions` body limit of 4.5 MB;
    - the admin uploader shrinks photos over 1.5 MB in the browser before sending them (canvas, longest side 2400 px, JPEG quality 0.9). `createImageBitmap` applies EXIF orientation. The server still checks the real format and makes the 1600 px and 480 px WebP renditions (ADR-017), so nothing visible is lost.
    - Checked with an 8.8 MB, 12 MP photo, which uploaded fine.
  - **The MCP explorer is turned off when `VERCEL=1`.** It starts `apps/mcp-server` as a child process over stdio, which serverless functions can't do. It still works locally, including under `next start`.
  - **The AI-draft sample is imported as JSON** (bundled at build time) instead of read from `data/` when a page loads.
  - **Node is pinned with `engines: "24.x"`,** matching `.nvmrc`, so Vercel can't pick a different major version.
- **Alternatives:** Direct browser-to-Supabase-Storage uploads with signed URLs (no body limit, but the server's format check and resize would have to run after the fact); Vercel Blob (a second storage service next to Supabase); a VPS or Docker host (more to operate); Netlify or Render (similar trade-offs; Vercel matches Next.js best).
- **Consequences:**
  - Previews and production share one Supabase project.
  - Supabase Free pauses after 7 quiet days.
  - Without JS, the plain upload form can't shrink photos, so photos over 4 MB fail there.
  - Sample-data mode is local-only.
  - The `VERCEL=1` switch and the bundled JSON were checked by building locally; the first real Vercel deploy is the final test.

## ADR-021 · Home page merchandising: admin-picked Featured shelf and sales-ranked Best sellers
- **Date:** 19 Nov 2026 · **Status:** Accepted
- **Context:** ADR-012 deferred "Featured" and "Best sellers" because nothing could drive them. Admin product editing (ADR-016) and real orders (ADR-019) now exist.
- **Decision:**
  - **`products.featured boolean`**, admin-only in the domain. `AdminProduct` gains `featured`; the storefront `Product`, `search_products`, the MCP server and the agent tools are unchanged. Any status may be featured, so a product can be lined up before launch. A partial index covers `created_at desc where featured`. The existing admin update policy covers the column.
  - **A separate `MerchandisingRepository` port** (`listFeatured`, `listBestSellers`) instead of new methods on `ProductRepository`. The MCP server and the draft agent only search and look up products, so their fakes don't have to implement shelf queries (interface segregation). Both methods return only active products in visible categories (ADR-018).
  - **"Sold" is defined once, in core:** `SOLD_ORDER_STATUSES = placed, dispatched, delivered`. Cash on Delivery counts (placed at once); `awaiting_payment` and `cancelled` don't. The SQL function receives the list as a parameter and the in-memory adapter uses the same constant, so they can't drift.
  - **Best sellers are computed when the page is built**, not stored as running totals (which would need updating on every order and could drift). Window: 90 days. Order: units sold, then name, then id. Cached with `cacheLife("hours")` plus the `catalog` tag: orders don't clear it, so the shelf can lag sales by up to about an hour, and a sale never throws away the whole catalogue cache. Admin edits clear it at once.
  - **`best_selling_products(since, sold_statuses, page_limit)` is `security definer`** with an empty `search_path`, execute revoked from `public` and granted to `anon`, `authenticated` and `service_role`. It reads orders, which anonymous users can't. As `security invoker` it would work today (the app reads with the service role) and silently return nothing once the auth phase moves reads to the anon key. It returns public product columns only: a ranking, never quantities or order data. A test checks the anon key gets the ranking but still can't read `orders` or `order_items`.
  - **Too few products hides a shelf:** Featured needs 1, Best sellers needs 2 (`MIN_BEST_SELLERS`; one product isn't a ranking). There's no fallback to "newest", because it would repeat New arrivals. Each shelf shows up to 4 (`HOME_SHELF_SIZE`).
  - **Home order:** Hero → Featured → Shop by category → Best sellers (its own Suspense boundary, no visible fallback) → New arrivals → Under ₹500. Featured and Best sellers have no "See all" link.
  - **Admin:** a "Home page" card on the product page (Feature / Remove, with optimistic concurrency like status changes), a Featured badge on the page and in the list, and a note when a featured product isn't live yet.
  - **The seed leaves `featured` alone**, like `visible` (ADR-018). The sample file's `featured` flags are for sample mode, which also ranks best sellers from the sample support orders.
- **Alternatives:** A `featured` filter in `search_products` (another drop-and-recreate of the function, and a `featured` column in every search row); a `featured_at` timestamp for manual ordering (not needed while the shelf is "newest 4"); a materialised view or counters for best sellers (refresh jobs or write paths for a 10-product shop); clearing the catalogue cache on every order (exact, but every sale empties the whole cache).
- **Consequences:**
  - The live shop has no featured products until an admin picks some, so the Featured shelf stays hidden until then.
  - The shelf query is one aggregate over 90 days of order lines. Fine at this size; a counter table or materialised view is the next step if orders grow large.
  - A shared merchandising contract (`contract/merchandising-contract.ts`) runs the same fixture in memory and on throwaway Supabase rows. The Supabase catalogue contract's paging check is now scoped to a seeded category, because parallel test files add live products.
  - Checked with `next start`: 14/14 browser checks (feature → shelf, hidden category excluded with an admin note, stale version refused, unfeature → shelf hidden, Best sellers equals the SQL ranking, section order, no overflow at 360 and 1280 px); live adapter tests 121/121, twice.

## ADR-022 · Customer accounts: email + password or mobile code, admin-controlled OTP, RLS on the app's reads
- **Date:** 20 Nov 2026 · **Status:** Accepted
- **Context:** Shoppers could only check out as guests, and the app read everything with the service role, so RLS (layer 4, ADR-011) held in the database but was bypassed by the app. ADR-015 and ADR-019 left three jobs for this phase: give baskets an owner, attach orders to accounts, and eventually link earlier guest orders. The business wants both email and mobile sign-in (mobile is the norm in India), wants guests to stay unrestricted, and wants to switch SMS sign-in off at will because SMS costs money once a real provider is connected.
- **Decision:**
  - **Two ways in, one Supabase Auth:** email + password (with "Confirm email" and a reset link), or an Indian mobile + 6-digit code (`signInWithOtp`, `shouldCreateUser: true`: the code proves the number is theirs). Phones are stored in E.164 (`+91…`); core `toIndianE164` reuses the checkout's `normaliseIndianMobile`.
  - **The session adapter is shared.** `session-client.ts` holds the `@supabase/ssr` client with hardened cookies (httpOnly, `SameSite=Lax`, Secure in production) for both the admin context (ADR-016) and the new customer context. Core has a `CustomerSession` port; the web app never sees tokens.
  - **No automatic sign-in from a typed number.** Typing a mobile at checkout signs nobody in, because anyone who knows the number could then open that account. When the switch is on, checkout offers "Get a code on your mobile". Entering the code signs the shopper in and merges their basket; skipping it keeps them a guest. The message is the same whether or not the number already has an account, so it can't be used to test numbers.
  - **The admin switch is enforced in three places:** the UI hides the option; the server actions refuse it; and the database refuses it. `store_settings.phone_otp_enabled` is a one-row table that admins update through RLS, with optimistic concurrency. The **Send SMS auth hook** `public.send_sms_mock` returns an error while it is off, so the auth server sends no code even to someone calling the Supabase API directly. Hiding a button is not enforcement.
  - **Mock SMS for now.** The hook writes each code to `sms_outbox`, which shoppers can't read (restrictive RLS) and admins can (`/admin/settings` lists the last 20). With `SMS_DELIVERY=mock` the server also logs `[mock-sms] 98xxxxxx10 code 123456`. Codes are never shown on the shopper's page, which would defeat the check. Following Supabase's guidance, the hook is not `security definer`: it runs as `supabase_auth_admin` with exactly two grants (read settings, insert into the outbox). A real provider later replaces the hook in the dashboard (India also needs DLT registration). No code change.
  - **Customer records are created at first sign-in** (`CustomerProvisioning.ensureForUser`, service role, idempotent and safe when two sign-ins race). Only a confirmed email is stored. It **never links an existing customer row with the same email or phone**. A clash signs the user out with a "contact us" message.
  - **Identity comes from the session, never a form.** `place_order` now takes `customer_id` from its payload. Only the server calls it (execute stays revoked from the public roles), and the server fills it from `getSignedIn()`. A forged field can't attach an order to an account.
  - **RLS now applies to the app's customer reads.** `/account` and `/account/orders/[orderNumber]` read through the shopper's own session: the page filters by their customer id (layer 3) and the existing "customers read their own orders/items" policies (layer 4) do the rest. Another customer's order is a 404, the same as a missing one. Server-only data (carts, `place_order`, payments, provisioning) stays on the service role.
  - **Baskets follow the account.** At sign-in the basket in the cookie joins the account's basket (`planCartMerge`: the same product and engraved name add up, capped at 10 a line, keyed exactly like `cart_items.name_key`). A basket is claimed only if nobody owns it yet (`claimForCustomer`, one conditional update), so a stale cookie on a shared device never pulls someone else's basket in. Sign-out drops the basket cookie, and the basket comes back at the next sign-in. Carts stay server-only (no owner RLS policy): the browser never queries Supabase directly, so the policy would protect nothing.
  - **The proxy now covers every page** but calls the auth server only when an `sb-*-auth-token` cookie exists, so anonymous browsing costs nothing extra. It refreshes tokens and redirects signed-out visitors away from `/admin/*` and `/account/*`. It is still not the security check: `requireSignedIn()` and `requireAdmin()` run in every page and action. The header's account icon is a static link (no session lookup per page).
  - **Redirect targets come from a fixed list** (`safeNext`), never from the URL. Email links use PKCE (`/auth/callback` exchanges `?code=` only in the browser that asked for it), and Supabase only redirects to its allow-list.
  - **The `/support` demo picker lists only customers without a login**, so a real account can never be impersonated there.
- **Deliberately not built (extension points):**
  - **Linking earlier guest orders:** a future `claim_guest_orders(customer_id)` would match a *verified* email or phone against `orders.contact_email` / `contact_phone`, which are already stored, and `customer_id` is already nullable. It needs its own rules (verified identifiers only, and what to do with demo customer rows), so it waits for a decision.
  - An address book, profile editing, a real SMS provider, and moving the support assistant onto the real session.
- **Alternatives:** Auto sign-in from the number typed at checkout (account takeover); silently attaching guest orders to the account with that number (the owner would see orders someone else placed); magic links (every sign-in costs an email, and the built-in mailer allows a few an hour); a real SMS provider now (an account, DLT registration and per-message cost before it's needed); a `security definer` hook (broader rights than the hook needs); an owner RLS policy on carts (no browser path to protect); an env-var feature flag for OTP (needs a redeploy and can't be enforced by the auth server).
- **Consequences:**
  - Dashboard settings live outside git: public sign-ups and "Confirm email" on; Site URL and `/auth/callback` redirect URLs; the Phone provider enabled with the Send SMS hook set to `public.send_sms_mock`. docs/DEPLOYMENT.md should list them.
  - Mock mode is for demos only: anyone who can read the server logs or the admin outbox can sign in as any number.
  - Accounts need Supabase with the anon key; sample mode has no accounts (as with the admin).
