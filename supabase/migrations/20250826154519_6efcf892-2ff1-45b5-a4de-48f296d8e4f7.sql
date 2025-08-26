-- Ensure current admin is actually admin
update public.profiles
set is_admin = true
where coalesce(replace(replace(phone,'+',''),' ',''),'') in ('919000666986','9000666986');

-- Create the bucket if it does not exist, make it public
insert into storage.buckets (id, name, public, file_size_limit)
values ('app-pdfs','app-pdfs', true, 8388608)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- Drop any old policies we created earlier
drop policy if exists app_pdfs_public_read  on storage.objects;
drop policy if exists app_pdfs_admin_insert on storage.objects;
drop policy if exists app_pdfs_admin_update on storage.objects;
drop policy if exists app_pdfs_admin_delete on storage.objects;

-- Public READ for that bucket
create policy app_pdfs_public_read
on storage.objects
for select
using (bucket_id = 'app-pdfs');

-- Admin-only INSERT/UPDATE/DELETE for that bucket
create policy app_pdfs_admin_insert
on storage.objects
for insert to authenticated
with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy app_pdfs_admin_update
on storage.objects
for update to authenticated
using (bucket_id = 'app-pdfs' and public.is_admin())
with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy app_pdfs_admin_delete
on storage.objects
for delete to authenticated
using (bucket_id = 'app-pdfs' and public.is_admin());

-- Ensure roles can use the storage schema
grant usage on schema storage to authenticated;