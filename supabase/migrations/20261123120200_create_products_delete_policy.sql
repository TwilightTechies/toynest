-- Deleting products (ADR-023, amends ADR-016's "no delete policy"). Admins may delete a product that
-- was never ordered; one that was ordered can only be archived. The trigger is the rule itself, so it
-- holds for every caller: the app's own check only exists to show a friendly message first.
-- Cart lines and photo rows go with the product (existing on delete cascade); photo files in Storage
-- are removed by the app afterwards.

create function public.refuse_ordered_product_delete()
returns trigger
language plpgsql
-- Definer: must see every order line, whatever the caller's RLS allows.
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.order_items where product_id = old.id) then
    raise exception 'product_has_orders' using errcode = 'P0001', detail = old.id::text,
      hint = 'Archive the product instead.';
  end if;
  return old;
end;
$$;

revoke execute on function public.refuse_ordered_product_delete() from public, anon, authenticated;

create trigger products_refuse_ordered_delete
  before delete on public.products
  for each row execute function public.refuse_ordered_product_delete();

create policy "Admins delete products"
  on public.products for delete
  to authenticated
  using ((select public.is_admin()));
