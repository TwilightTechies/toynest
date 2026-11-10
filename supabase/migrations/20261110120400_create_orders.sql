create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Human-facing order id, used as Order.id in the domain.
  order_number text not null unique check (order_number ~ '^TN-[0-9]{4}$'),
  customer_id uuid not null references public.customers (id),
  status text not null check (status in ('placed', 'dispatched', 'delivered', 'cancelled')),
  placed_at timestamptz not null,
  delivered_at timestamptz,
  -- Money in integer minor units (pence).
  total_minor integer not null check (total_minor >= 0),
  refunded_minor integer not null default 0 check (refunded_minor >= 0),
  currency char(3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_refund_within_total check (refunded_minor <= total_minor)
);

-- Supports "this customer's orders, newest first".
create index orders_customer_id_placed_at_idx on public.orders (customer_id, placed_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Isolation layer 4: a signed-in user sees only orders of their own customer row.
create policy "Customers read their own orders"
  on public.orders for select
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c where c.auth_user_id = (select auth.uid())
    )
  );
