-- Admin catalogue writes (ADR-016). The web app checks the admin role itself (layer 3); these
-- policies make the database refuse the same writes on its own (layer 4) when the request carries a
-- non-admin session. There is no delete policy: products are archived, never deleted, because
-- order and cart lines reference them.

create policy "Admins read every product"
  on public.products for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins create products"
  on public.products for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update products"
  on public.products for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
