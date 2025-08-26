-- 0) Ensure bucket exists
do $$
begin
  if not exists (select 1 from storage.buckets where id='app-pdfs') then
    perform storage.create_bucket('app-pdfs', true, 8388608, array['application/pdf']);
  end if;
end$$;

-- 1) Drop any old storage policies for this bucket and recreate minimal set
drop policy if exists "app-pdfs public read" on storage.objects;
drop policy if exists "app-pdfs admin insert" on storage.objects;
drop policy if exists "app-pdfs admin update" on storage.objects;
drop policy if exists "app-pdfs admin delete" on storage.objects;

-- Public read (store listing needs public access)
create policy "app-pdfs public read"
  on storage.objects for select
  using (bucket_id = 'app-pdfs');

-- Admin-only write (insert/update/delete)
create policy "app-pdfs admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'app-pdfs' and public.is_admin());

create policy "app-pdfs admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin());

create policy "app-pdfs admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'app-pdfs' and public.is_admin());

-- 2) Ensure ops_settings RLS definitely allows admins
alter table public.ops_settings enable row level security;
drop policy if exists ops_admin_rw on public.ops_settings;
create policy ops_admin_rw
  on public.ops_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Harden/replace is_admin() (security definer + search_path)
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

-- 4) Create RPCs to write settings with SECURITY DEFINER (bypass client RLS ambiguity)
drop function if exists public.admin_set_legal_pdf(text,text);
create or replace function public.admin_set_legal_pdf(kind text, url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if kind not in ('privacy','terms') then
    raise exception 'Invalid kind';
  end if;

  insert into public.ops_settings(key, value)
  values (kind || '_pdf_url', url)
  on conflict (key) do update set value = excluded.value;

  insert into public.ops_settings(key, value)
  values (kind || '_pdf_uploaded_at', now()::text)
  on conflict (key) do update set value = excluded.value;
end;
$$;
grant execute on function public.admin_set_legal_pdf(text,text) to authenticated;

drop function if exists public.admin_get_legal_pdfs();
create or replace function public.admin_get_legal_pdfs()
returns table(privacy_url text, terms_url text)
language sql
security definer
set search_path = public
as $$
  select
    (select value from public.ops_settings where key='privacy_pdf_url') as privacy_url,
    (select value from public.ops_settings where key='terms_pdf_url')   as terms_url;
$$;
grant execute on function public.admin_get_legal_pdfs() to authenticated;