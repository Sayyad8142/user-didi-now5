-- Ensure app-pdfs bucket is public
update storage.buckets set public = true where id = 'app-pdfs';

-- Policies to allow admins to manage files in app-pdfs
-- Use public.is_admin() to gate access
create policy if not exists "app_pdfs_admin_insert"
  on storage.objects
  for insert
  to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin())
  with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy if not exists "app_pdfs_admin_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin())
  with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy if not exists "app_pdfs_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin());