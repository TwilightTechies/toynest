-- The storefront filters and sorts by price (ADR-012). Tiny today, but the migration rule asks for an
-- index on every frequently filtered column, and it serves the price-asc/price-desc sorts as well.
create index products_price_minor_idx on public.products (price_minor);
