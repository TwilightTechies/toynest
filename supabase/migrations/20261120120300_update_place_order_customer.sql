-- Signed-in checkout (ADR-022): place_order stores the customer's id instead of always null.
-- The id comes from the server's verified session, never from the checkout form; execute stays
-- revoked from the public roles, so only the service role (the app's server) can call this.
-- Guests still pass no customer_id (null), and the orders_customer_or_guest check is unchanged.
-- Body otherwise identical to 20261113150000_add_checkout_orders.
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
