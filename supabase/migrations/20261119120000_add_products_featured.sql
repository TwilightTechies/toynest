-- Featured products (ADR-021): an admin picks products for the home page's "Featured" shelf.
-- Any status may be featured (a product can be prepared before launch); the shelf query shows only
-- active products in visible categories. The existing admin update policy (ADR-016) covers this
-- column, and the public select policy already hides drafts, so no new RLS is needed.
alter table public.products
  add column featured boolean not null default false;

-- The shelf reads "featured, newest first"; few rows are featured, so a partial index stays tiny.
create index products_featured_created_at_idx on public.products (created_at desc) where featured;
