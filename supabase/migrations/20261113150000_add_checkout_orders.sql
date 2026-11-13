-- Checkout (ADR-019): guest orders with frozen prices, mock online payment or Cash on Delivery.

-- Order numbers: "TN-" plus 4 to 8 digits. Seeded orders are TN-10xx and test orders TN-9xxx;
-- checkout numbers come from this sequence, starting at TN-20001, so they never collide.
create sequence public.order_number_seq start 20001;

alter table public.orders drop constraint if exists orders_order_number_check;
alter table public.orders add constraint orders_order_number_check check (order_number ~ '^TN-[0-9]{4,8}$');

-- awaiting_payment: an online-payment order that isn't paid yet.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting_payment', 'placed', 'dispatched', 'delivered', 'cancelled'));

-- Guest checkout: no customer account yet (accounts come in the auth phase, which links them).
alter table public.orders alter column customer_id drop not null;

alter table public.orders
  -- Random per checkout page view; the same token always returns the same order (idempotency).
  add column checkout_token uuid unique,
  -- The basket the order came from (no FK: the basket is deleted once the order succeeds).
  add column cart_id uuid,
  -- Frozen at order time, so a later price or delivery-fee change never rewrites the order.
  add column subtotal_minor integer check (subtotal_minor >= 0),
  add column delivery_minor integer check (delivery_minor >= 0),
  add column zone_name text,
  add column payment_method text check (payment_method in ('online', 'cod')),
  -- cod_due: Cash on Delivery, collected by the courier.
  add column payment_status text check (payment_status in ('pending', 'paid', 'failed', 'cod_due')),
  add column contact_name text check (length(contact_name) between 2 and 80),
  add column contact_email text check (length(contact_email) <= 254),
  add column contact_phone text check (contact_phone ~ '^[6-9][0-9]{9}$'),
  add column address_line1 text check (length(address_line1) between 3 and 120),
  add column address_line2 text check (length(address_line2) <= 120),
  add column city text check (length(city) between 2 and 60),
  add column state text check (length(state) between 2 and 60),
  add column pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  -- Either a customer account (seeded/support orders) or a guest's contact and address.
  add constraint orders_customer_or_guest check (
    customer_id is not null
    or (contact_email is not null and contact_phone is not null and address_line1 is not null and pincode is not null)
  ),
  add constraint orders_total_adds_up check (
    subtotal_minor is null or total_minor = subtotal_minor + coalesce(delivery_minor, 0)
  );

-- The name engraved on a personalised item, copied from the basket line.
alter table public.order_items
  add column personalisation_name text check (length(personalisation_name) between 1 and 20);

-- Every payment attempt, kept for audit (amount, outcome, gateway reference, reason for failure).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  amount_minor integer not null check (amount_minor > 0),
  -- started: we're calling the gateway; pending: the bank hasn't confirmed yet.
  status text not null check (status in ('started', 'pending', 'succeeded', 'failed')),
  reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_id_idx on public.payments (order_id);

-- At most one attempt in progress per order: two simultaneous "Pay" clicks can't both charge.
create unique index payments_one_open_attempt on public.payments (order_id) where status in ('started', 'pending');

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Server-only, like baskets: RLS on, and only admins may read (below).
alter table public.payments enable row level security;

-- Admins see every order, line and payment (the read-only /admin/orders list).
create policy "Admins read every order"
  on public.orders for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins read every order line"
  on public.order_items for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins read payments"
  on public.payments for select
  to authenticated
  using ((select public.is_admin()));

-- Writes an order and its lines in ONE transaction, numbering it from the sequence. Idempotent on
-- checkout_token: a repeat (double click, retried request) returns the existing order's id, even
-- when two requests race (the unique violation is caught and the winner's id returned).
-- Prices arrive already computed by the app's priceCart; this function only stores them.
-- Server-only: execute is revoked from the public roles, so only the service role can call it.
create function public.place_order(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  token uuid := (payload ->> 'checkout_token')::uuid;
  existing uuid;
  new_id uuid;
begin
  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'an order needs at least one line' using errcode = '22023';
  end if;

  select id into existing from public.orders where checkout_token = token;
  if existing is not null then
    return existing;
  end if;

  begin
    insert into public.orders (
      order_number, customer_id, status, placed_at, total_minor, currency,
      checkout_token, cart_id, subtotal_minor, delivery_minor, zone_name, payment_method, payment_status,
      contact_name, contact_email, contact_phone, address_line1, address_line2, city, state, pincode
    )
    values (
      'TN-' || nextval('public.order_number_seq'), null, payload ->> 'status', now(),
      (payload ->> 'total_minor')::integer, payload ->> 'currency',
      token, (payload ->> 'cart_id')::uuid, (payload ->> 'subtotal_minor')::integer,
      (payload ->> 'delivery_minor')::integer, payload ->> 'zone_name', payload ->> 'payment_method',
      payload ->> 'payment_status', payload ->> 'contact_name', payload ->> 'contact_email',
      payload ->> 'contact_phone', payload ->> 'address_line1', nullif(payload ->> 'address_line2', ''),
      payload ->> 'city', payload ->> 'state', payload ->> 'pincode'
    )
    returning id into new_id;
  exception when unique_violation then
    select id into existing from public.orders where checkout_token = token;
    if existing is null then
      raise;
    end if;
    return existing;
  end;

  insert into public.order_items (
    order_id, product_id, product_slug, product_name, unit_price_minor, quantity, personalisation_name
  )
  select
    new_id,
    (item ->> 'product_id')::uuid,
    item ->> 'product_slug',
    item ->> 'product_name',
    (item ->> 'unit_price_minor')::integer,
    (item ->> 'quantity')::integer,
    nullif(item ->> 'personalisation_name', '')
  from jsonb_array_elements(payload -> 'items') as item;

  return new_id;
end;
$$;

revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
grant usage, select on sequence public.order_number_seq to service_role;
