create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) > 0),
  email text not null unique,
  -- Link to Supabase Auth. Null for demo customers that have no account.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The unique constraint already indexes auth_user_id, which every RLS check filters on.

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

-- Isolation layer 4: a signed-in user sees only their own customer row.
-- (select auth.uid()) is evaluated once per query instead of once per row.
create policy "Customers read their own row"
  on public.customers for select
  to authenticated
  using (auth_user_id = (select auth.uid()));
