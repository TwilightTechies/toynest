-- Storage bucket for product photos (ADR-017). Public: files are served by URL through the CDN,
-- with no signed URLs, because product photos are meant to be seen. Storage itself refuses anything
-- that isn't a WebP of at most 2 MB; the app only ever uploads its own resized WebP renditions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Writing needs an admin session (RLS on storage.objects). Public reads go through the public URL
-- and need no policy. Deleting through the API also reads the row first, hence the select policy.
create policy "Admins read product image objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

create policy "Admins upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

create policy "Admins delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
