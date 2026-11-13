-- Product photos (ADR-017). The files live in Supabase Storage (bucket product-images); this table
-- holds what the shop needs to show them: which product, the storage path, alt text and order.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- Storage key prefix "<product_id>/<id>"; the files are "<path>-large.webp" and "<path>-small.webp".
  path text not null unique,
  alt text not null check (length(alt) between 1 and 200),
  -- 0 = main photo. The check plus the unique constraint cap a product at 8 photos in the database
  -- itself, not only in the app. Deferrable, so a reorder can swap positions within one statement.
  position smallint not null check (position between 0 and 7),
  -- Size of the large rendition (the small one has the same aspect ratio).
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now(),
  constraint product_images_position_unique unique (product_id, position) deferrable initially immediate
);

-- The unique constraint's index (product_id, position) serves "photos for these products" lookups.

alter table public.product_images enable row level security;

-- Shoppers see photos of live products only; a draft's photos stay private until it is published.
create policy "Photos of active products are readable by everyone"
  on public.product_images for select
  to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

create policy "Admins read every photo"
  on public.product_images for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins add photos"
  on public.product_images for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins edit photos"
  on public.product_images for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete photos"
  on public.product_images for delete
  to authenticated
  using ((select public.is_admin()));

-- Rewrites the order of one product's photos in a single statement (positions 0..n-1).
-- security invoker: it runs as the caller, so the RLS policies above still decide who may do it.
create function public.reorder_product_images(product uuid, ordered uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cardinality(ordered) <> (select count(*) from public.product_images where product_id = product)
     or exists (
       select 1 from unnest(ordered) as o(id)
       where not exists (select 1 from public.product_images i where i.id = o.id and i.product_id = product)
     )
  then
    raise exception 'ordered ids must be exactly the product''s photos' using errcode = '22023';
  end if;

  update public.product_images
  set position = array_position(ordered, id) - 1
  where product_id = product;
end;
$$;

revoke execute on function public.reorder_product_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_images(uuid, uuid[]) to authenticated;
