-- Create non-public bucket for legal PDFs
select case
  when not exists (select 1 from storage.buckets where id='legal-pdfs')
    then storage.create_bucket('legal-pdfs', public := false)
  else null
end;

-- Storage RLS: allow authenticated READ; admin-only write for bucket 'legal-pdfs'
drop policy if exists legalpdf_read on storage.objects;
create policy legalpdf_read on storage.objects
for select to authenticated
using (bucket_id = 'legal-pdfs');

drop policy if exists legalpdf_insert on storage.objects;
create policy legalpdf_insert on storage.objects
for insert to authenticated
with check (bucket_id='legal-pdfs' and public.is_admin());

drop policy if exists legalpdf_update on storage.objects;
create policy legalpdf_update on storage.objects
for update to authenticated
using (bucket_id='legal-pdfs' and public.is_admin())
with check (bucket_id='legal-pdfs' and public.is_admin());

drop policy if exists legalpdf_delete on storage.objects;
create policy legalpdf_delete on storage.objects
for delete to authenticated
using (bucket_id='legal-pdfs' and public.is_admin());