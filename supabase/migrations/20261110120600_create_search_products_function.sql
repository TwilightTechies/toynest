-- Catalogue search with stemming and prefix matching, ranked by relevance.
--   "puzzles" finds "puzzle" (english stemming: both become 'puzzl')
--   "wood"    finds "wooden" (prefix match: 'wood':*)
-- Words are OR-ed, matching the in-memory adapter; better matches rank first.
-- The tsquery is built from lexemes of to_tsvector, so user punctuation cannot break the syntax.
-- security invoker: the caller's RLS applies (anon sees only active products).
create or replace function public.search_products(
  search_text text default null,
  category uuid default null,
  page_limit integer default 20,
  page_offset integer default 0
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
    p.price_minor, p.currency, p.status,
    count(*) over () as total_count
  from public.products p, q
  where p.status = 'active'
    and (category is null or p.category_id = category)
    and (q.query is null or p.search_vector @@ q.query)
  order by
    case when q.query is null then 0 else ts_rank(p.search_vector, q.query) end desc,
    p.name
  limit greatest(least(page_limit, 100), 0)
  offset greatest(page_offset, 0);
$$;
