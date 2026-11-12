-- Shopping baskets (ADR-015). The id is the secret held in the shopper's httpOnly cookie
-- (gen_random_uuid: 122 random bits). Carts hold no prices: they are priced from products on read.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  -- Set when a signed-in customer owns the cart (auth phase); guests have null.
  customer_id uuid references public.customers (id) on delete set null,
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carts_customer_id_idx on public.carts (customer_id);

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

alter table public.carts enable row level security;

-- Deny by default, stated explicitly: anon and signed-in users can't read or write carts at all.
-- Only the server touches carts (service role, which bypasses RLS), always filtered by the cart id
-- from the cookie. The auth phase replaces this with an owner policy (customer_id = the signed-in
-- customer) when the app moves to user-scoped clients.
create policy "Carts are server-only"
  on public.carts as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);
