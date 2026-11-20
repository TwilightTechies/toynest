# Deploying ToyNest to Vercel

ToyNest runs on Vercel (the web app) and Supabase (database, auth and photo storage). See ADR-020.

## Plans and costs
- **Vercel Hobby (free)** is for personal, non-commercial projects. ToyNest as a learning project with
  synthetic data fits. **Selling for real is commercial use and needs a paid Pro plan.** Hobby has
  usage caps; going over them pauses the project rather than billing you.
- **Supabase Free** pauses a project after 7 days with no database requests. Deploys and git pushes
  don't count, only real traffic. Resume it from the Supabase dashboard if that happens.

## One-time setup
1. Merge the open PRs into `main`.
2. Sign in to vercel.com with GitHub → **Add New → Project** → import `TwilightTechies/toynest`.
3. **Root Directory:** `apps/web`. Next.js is detected; npm workspaces install from the repo root.
   Node comes from `engines` (`24.x`).
4. **Environment Variables** (Production, and Preview if you want previews to work):
   | Name | Notes |
   |---|---|
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never in a `NEXT_PUBLIC_` variable |
   | `SUPABASE_ANON_KEY` | Needed for admin and customer sign-in |
   | `SITE_URL` | Optional: `https://<your-domain>`, used in email links (else taken from the request) |
   | `SMS_DELIVERY` | `mock` logs mobile sign-in codes to the function logs (ADR-022) |
   | `ANTHROPIC_API_KEY` | Optional: enables live AI drafts (each run costs money) |
5. **Deploy.** Every push to `main` redeploys; every PR gets a preview URL.

6. **Supabase → Authentication** (customer accounts, ADR-022; not stored in git):
   - **Sign In / Providers:** allow new users to sign up; Email with **Confirm email** on; **Phone** enabled.
   - **Hooks → Send SMS hook:** Postgres, `public.send_sms_mock` (mock delivery: codes go to the
     `sms_outbox` table and `/admin/settings`, never to a real phone).
   - **URL Configuration:** Site URL = the production URL; Redirect URLs include
     `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
   - Mobile sign-in stays off until an admin turns it on in `/admin/settings`.

## Before sharing the URL
- Customers can now sign up (ADR-022), so public sign-ups stay **on**. Admin rights still come only from
  `npm run admin:create -w @toynest/adapters -- <email>`: a sign-up never becomes an admin.
- Mock SMS is for demos: anyone who can read the function logs or the admin outbox can sign in as any
  mobile number. Connect a real SMS provider (and India's DLT registration) before real customers use it.
- Previews and production use the **same** Supabase project: test orders from a preview land in the
  live database.
- The checkout's test-payment panel is public: anyone can place pretend orders.

## What differs from local
- **Photo uploads:** Vercel refuses request bodies over 4.5 MB (all plans), so the admin uploader
  shrinks photos in the browser first and the server accepts up to 4 MB per photo.
- **MCP explorer:** off on Vercel (it starts a local process); it still works with `npm run dev`.
- **Sample-data mode** (no Supabase variables) is for local use only.

## Before selling for real
A real payment gateway behind the `PaymentProvider` port, privacy/terms/refund pages, GST handling,
order emails, and the Vercel Pro plan.
