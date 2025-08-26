-- Create public bucket for app PDFs
insert into storage.buckets (id, name, public)
values ('app-pdfs','app-pdfs', true)
on conflict (id) do update set public = true;

-- Public read policy
create policy if not exists "Public read app-pdfs"
on storage.objects for select
using (bucket_id = 'app-pdfs');

-- Admin write policies (uses public.is_admin())
create policy if not exists "Admin insert app-pdfs"
on storage.objects for insert
with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy if not exists "Admin update app-pdfs"
on storage.objects for update
using (bucket_id = 'app-pdfs' and public.is_admin());

create policy if not exists "Admin delete app-pdfs"
on storage.objects for delete
using (bucket_id = 'app-pdfs' and public.is_admin());

-- Ensure ops_settings table exists with proper RLS
create table if not exists public.ops_settings (
  key   text primary key,
  value text not null
);

-- Enable RLS and create admin-only policy
alter table public.ops_settings enable row level security;
drop policy if exists ops_admin_all on public.ops_settings;
create policy ops_admin_all on public.ops_settings
for all using (public.is_admin()) with check (public.is_admin());