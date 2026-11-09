-- 0023_storage — receipt PDFs (private) and news images (public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760, array['application/pdf']::text[]),
  ('news-images', 'news-images', true, 15728640, array['image/png', 'image/jpeg', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Supabase already enables RLS on storage.objects; ALTER TABLE requires table
-- ownership, which the migration role does not have on hosted projects.
-- Policies can still be created from SQL.

drop policy if exists receipts_read_own on storage.objects;
create policy receipts_read_own on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists receipts_admin_write on storage.objects;
create policy receipts_admin_write on storage.objects
for all to authenticated
using (bucket_id = 'receipts' and public.is_admin())
with check (bucket_id = 'receipts' and public.is_admin());

drop policy if exists news_images_public_read on storage.objects;
create policy news_images_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'news-images');

drop policy if exists news_images_admin_write on storage.objects;
create policy news_images_admin_write on storage.objects
for all to authenticated
using (bucket_id = 'news-images' and public.is_admin())
with check (bucket_id = 'news-images' and public.is_admin());
