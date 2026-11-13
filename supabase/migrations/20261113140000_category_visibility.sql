-- Category management (ADR-018): show/hide, menu order and a short menu label.

alter table public.categories
  -- "Show in shop". Hiding a category hides all its products from the shop without changing their
  -- status, so a seasonal range can be switched off in January and on again in November.
  add column visible boolean not null default true,
  -- Menu and filter order, lowest first (ties by name).
  add column sort_order smallint not null default 0,
  -- Short header label, e.g. "Christmas"; the name is used when null.
  add column menu_label text check (menu_label is null or length(menu_label) between 1 and 30);

-- Number existing categories in the order they were added (seeded ones by name), so categories
-- added later (e.g. Christmas decorations) start at the end.
update public.categories c
set sort_order = o.position
from (
  select id, (row_number() over (order by created_at, name) - 1)::smallint as position
  from public.categories
) o
where o.id = c.id;

-- Keep today's short header labels for the seeded categories (the header used to hard-code them).
update public.categories set menu_label = 'Educational' where slug = 'educational-toys';
update public.categories set menu_label = 'Personalised' where slug = 'personalised-toys';

-- Admins edit categories (the app also checks, ADR-016). No one else may write them.
create policy "Admins create categories"
  on public.categories for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update categories"
  on public.categories for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Only an empty category can go: products.category_id has no cascade, so the foreign key refuses it.
create policy "Admins delete categories"
  on public.categories for delete
  to authenticated
  using ((select public.is_admin()));

-- Shoppers see shown categories only; admins see all.
drop policy "Categories are readable by everyone" on public.categories;

create policy "Shown categories are readable by everyone"
  on public.categories for select
  to anon, authenticated
  using (visible);

create policy "Admins read every category"
  on public.categories for select
  to authenticated
  using ((select public.is_admin()));

-- A product is public only while it is active AND its category is shown. Product photos follow,
-- because their policy checks the product through this policy.
drop policy "Active products are readable by everyone" on public.products;

create policy "Active products in shown categories are readable by everyone"
  on public.products for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (select 1 from public.categories c where c.id = category_id and c.visible)
  );

-- Catalogue search, unchanged (ADR-012) except that products in hidden categories are excluded.
-- The service-role client the shop uses today bypasses RLS, so the rule must live here too.
-- Drop + create (same signature) as in 20261112120000.
drop function if exists public.search_products(text, uuid, integer, integer, text, integer, integer);

create function public.search_products(
  search_text text default null,
  category uuid default null,
  page_limit integer default 20,
  page_offset integer default 0,
  sort_by text default 'relevance',
  min_price integer default null,
  max_price integer default null
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
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select to_tsquery(
      'english',
      string_agg(quote_literal(lexeme) || ':*', ' | ')
    ) as query
    from unnest(tsvector_to_array(to_tsvector('english', coalesce(search_text, '')))) as lexeme
  )
  select
    p.id, p.slug, p.name, p.description, p.category_id,
    p.price_minor, p.currency, p.status, p.attributes, p.created_at,
    count(*) over () as total_count
  from public.products p
  join public.categories c on c.id = p.category_id and c.visible
  cross join q
  where p.status = 'active'
    and (category is null or p.category_id = category)
    and (min_price is null or p.price_minor >= min_price)
    and (max_price is null or p.price_minor <= max_price)
    and (q.query is null or p.search_vector @@ q.query)
  order by
    case when sort_by = 'price-asc' then p.price_minor end asc,
    case when sort_by = 'price-desc' then p.price_minor end desc,
    case when sort_by = 'newest' then p.created_at end desc,
    case
      when sort_by in ('price-asc', 'price-desc', 'newest', 'name') or q.query is null then 0
      else ts_rank(p.search_vector, q.query)
    end desc,
    p.name,
    p.id
  limit greatest(least(page_limit, 100), 0)
  offset greatest(page_offset, 0);
$$;
