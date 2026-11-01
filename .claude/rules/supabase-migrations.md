---
paths:
  - "supabase/migrations/**"
---

# Supabase migration conventions
- One concern per migration; filename `<timestamp>_<verb>_<subject>.sql`.
- Every table: `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at timestamptz not null default now()`.
- Every new table enables RLS in the same migration, with explicit policies. No table ships without policies.
- Never drop or rename a column in the same migration that stops using it; deprecate first.
- Money is `numeric(10,2)`; order items store the unit price at purchase time.
- Add indexes for every foreign key and every column used in a frequent filter.
