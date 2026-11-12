-- Basket lines (ADR-015). The same product with two different engraving names is two lines.
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 10),
  personalisation_name text check (length(personalisation_name) between 1 and 20),
  -- Lets the unique key treat "no name" as one value (null is never equal to null).
  name_key text generated always as (coalesce(personalisation_name, '')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, name_key)
);

create index cart_items_cart_id_idx on public.cart_items (cart_id);
create index cart_items_product_id_idx on public.cart_items (product_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

alter table public.cart_items enable row level security;

-- Deny by default, like carts: server-only until the auth phase adds an owner policy.
create policy "Cart items are server-only"
  on public.cart_items as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);
