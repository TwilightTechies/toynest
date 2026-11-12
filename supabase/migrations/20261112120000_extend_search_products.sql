-- Storefront browsing (ADR-012): price range, sort order, and attributes/created_at in the result.
--
-- Drop, then create, rather than `create or replace`:
--   * the return type changes (two new columns), which `create or replace` cannot do;
--   * adding parameters with `create or replace` creates a second overload, and a PostgREST RPC
--     call with named arguments would then be ambiguous between the two.
drop function if exists public.search_products(text, uuid, integer, integer);

-- Catalogue search with stemming and prefix matching (unchanged from 20261110120600):
--   "puzzles" finds "puzzle" (english stemming), "wood" finds "wooden" (prefix 'wood':*).
-- New: inclusive price bounds in pence, and sort_by:
--   relevance (default; same as name when there is no search text), price-asc, price-desc, newest, name.
-- Unknown sort_by values behave like relevance. Every order ends in name, id so pages are stable.
-- security invoker: the caller's RLS applies (anon sees only active products).
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
  from public.products p, q
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
