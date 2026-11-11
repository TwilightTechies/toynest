create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- Nullable: the product may later be deleted, but the order line must survive.
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot at purchase time: later catalogue changes must not rewrite past orders.
  product_slug text not null,
  product_name text not null,
  unit_price_minor integer not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

alter table public.order_items enable row level security;

-- Isolation layer 4: visible only through an order the user owns.
create policy "Customers read items of their own orders"
  on public.order_items for select
  to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.auth_user_id = (select auth.uid())
    )
  );
