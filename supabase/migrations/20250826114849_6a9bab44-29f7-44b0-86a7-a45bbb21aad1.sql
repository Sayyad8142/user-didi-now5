-- Create public bucket for app PDFs
insert into storage.buckets (id, name, public)
values ('app-pdfs','app-pdfs', true)
on conflict (id) do update set public = true;

-- Drop existing policies if they exist
drop policy if exists "Public read app-pdfs" on storage.objects;
drop policy if exists "Admin insert app-pdfs" on storage.objects;
drop policy if exists "Admin update app-pdfs" on storage.objects;
drop policy if exists "Admin delete app-pdfs" on storage.objects;

-- Public read policy
create policy "Public read app-pdfs"
on storage.objects for select
using (bucket_id = 'app-pdfs');

-- Admin write policies (uses public.is_admin())
create policy "Admin insert app-pdfs"
on storage.objects for insert
with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy "Admin update app-pdfs"
on storage.objects for update
using (bucket_id = 'app-pdfs' and public.is_admin());

create policy "Admin delete app-pdfs"
on storage.objects for delete
using (bucket_id = 'app-pdfs' and public.is_admin());