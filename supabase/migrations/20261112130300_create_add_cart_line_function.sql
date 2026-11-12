-- Adds to a basket atomically (ADR-015): a new line, or more of an existing line with the same
-- product and name, capped at 10. One statement, so two quick clicks can neither create a
-- duplicate line nor lose an update. Also bumps the cart's updated_at (for expiring old carts).
-- security invoker: the caller's RLS applies; today only the service role calls it.
create function public.add_cart_line(
  cart uuid,
  product uuid,
  personalisation text,
  add_quantity integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.cart_items (cart_id, product_id, personalisation_name, quantity)
  values (cart, product, personalisation, least(greatest(add_quantity, 1), 10))
  on conflict (cart_id, product_id, name_key)
  do update set quantity = least(public.cart_items.quantity + excluded.quantity, 10);

  update public.carts set updated_at = now() where id = cart;
$$;
