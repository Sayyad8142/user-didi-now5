-- 1) Create the bucket if it does not exist (public read, PDFs up to 8MB)
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'app-pdfs') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('app-pdfs', 'app-pdfs', true, 8388608, array['application/pdf']);
  end if;
end$$;

-- 2) Storage RLS: public read, admin-only write
-- Public SELECT so store links work
drop policy if exists "app-pdfs public read" on storage.objects;
create policy "app-pdfs public read"
  on storage.objects for select
  using (bucket_id = 'app-pdfs');

-- Admin INSERT
drop policy if exists "app-pdfs admin insert" on storage.objects;
create policy "app-pdfs admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'app-pdfs' and public.is_admin());

-- Admin UPDATE
drop policy if exists "app-pdfs admin update" on storage.objects;
create policy "app-pdfs admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin());

-- Admin DELETE
drop policy if exists "app-pdfs admin delete" on storage.objects;
create policy "app-pdfs admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin());

-- 3) Ensure ops_settings allows admin read/write (used to save URLs)
alter table public.ops_settings enable row level security;
drop policy if exists ops_admin_rw on public.ops_settings;
create policy ops_admin_rw
  on public.ops_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4) Harden is_admin() (security definer + search_path)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;
grant execute on function public.is_admin() to authenticated;