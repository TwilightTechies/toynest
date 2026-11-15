-- The admin order list (ADR-019) shows every order newest first; this index serves that sort.
create index orders_placed_at_idx on public.orders (placed_at desc);
