-- Best sellers (ADR-021): active products in visible categories, ranked by units sold since a date.
--
-- "What counts as sold" is decided in core (SOLD_ORDER_STATUSES) and passed in, so the SQL and the
-- in-memory adapter can't drift apart.
--
-- SECURITY DEFINER on purpose. Ranking needs orders and order_items, which anonymous shoppers can't
-- read under RLS. As SECURITY INVOKER this would work today (the app reads with the service role) and
-- then silently return nothing once the auth phase moves reads to the anon key. Running as the owner
-- is safe because the function returns only public product columns: a ranking, never quantities,
-- prices paid, customers or orders. search_path is empty, so every name is schema-qualified.
create function public.best_selling_products(
  since timestamptz,
  sold_statuses text[],
  page_limit integer default 4
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  category_id uuid,
  price_minor integer,
  currency char(3),
  status text,
  attributes jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.slug, p.name, p.description, p.category_id,
    p.price_minor, p.currency, p.status, p.attributes, p.created_at
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  join public.categories c on c.id = p.category_id and c.visible
  where o.status = any (sold_statuses)
    and o.placed_at >= since
    and p.status = 'active'
  group by p.id
  order by sum(oi.quantity) desc, p.name, p.id
  limit greatest(least(page_limit, 100), 0);
$$;

-- Functions are executable by PUBLIC by default; grant only the roles that should call it.
revoke all on function public.best_selling_products(timestamptz, text[], integer) from public;
grant execute on function public.best_selling_products(timestamptz, text[], integer) to anon, authenticated, service_role;
