-- Stock at order placement (ADR-023). Same as 20261120120300_update_place_order_customer, plus one
-- step between writing the order row and its lines: every tracked product in the order loses its
-- quantity, or the call fails with 'out_of_stock' and the whole transaction, order row included, rolls
-- back.
--
-- * Quantities are summed per product first: one toy can sit on two lines with different names.
-- * Products are updated in product_id order, so two checkouts lock rows in the same order and can't
--   deadlock each other.
-- * The conditional UPDATE takes the row lock and checks in one statement: a second checkout for the
--   last unit waits for the first, then sees stock 0 and fails. No read-then-write race.
-- * The order row is inserted first, so a replay or a parallel call with the same checkout_token stops
--   at the unique token (and returns the first order) before touching stock: never a double decrement.
create or replace function public.place_order(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  token uuid := (payload ->> 'checkout_token')::uuid;
  existing uuid;
  new_id uuid;
  wanted record;
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
      'TN-' || nextval('public.order_number_seq'), (payload ->> 'customer_id')::uuid, payload ->> 'status', now(),
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

  for wanted in
    select (item ->> 'product_id')::uuid as product_id, sum((item ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(payload -> 'items') as item
    group by 1
    order by 1
  loop
    update public.products
      set stock = stock - wanted.quantity
      where id = wanted.product_id and stock is not null and stock >= wanted.quantity;
    if not found and exists (
      select 1 from public.products where id = wanted.product_id and stock is not null
    ) then
      raise exception 'out_of_stock' using errcode = 'P0001', detail = wanted.product_id::text;
    end if;
  end loop;

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
