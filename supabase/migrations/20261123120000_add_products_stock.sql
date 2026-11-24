-- Stock per product (ADR-023). Optional: null = not tracked (unlimited), which is what every existing
-- product keeps, so nothing in the shop changes until an admin enters a number. place_order() reduces it
-- in the same transaction as the order; the basket never reserves stock.
alter table public.products
  add column stock integer check (stock >= 0);

comment on column public.products.stock is
  'Units on hand; null = not tracked. Reduced only by place_order() and set by admins (ADR-023).';
