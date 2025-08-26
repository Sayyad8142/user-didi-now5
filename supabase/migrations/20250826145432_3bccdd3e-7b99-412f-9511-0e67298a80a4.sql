-- Ensure admin function exists and is callable in policies
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

-- Create/repair bucket used for Legal PDFs
insert into storage.buckets (id, name, public)
values ('app-pdfs','app-pdfs', true)
on conflict (id) do update set public = true;

-- Enable public read, admin-only write for this bucket
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='legal_pdfs_public_read'
  ) then
    create policy legal_pdfs_public_read
    on storage.objects for select
    using (bucket_id = 'app-pdfs');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='legal_pdfs_admin_insert'
  ) then
    create policy legal_pdfs_admin_insert
    on storage.objects for insert to authenticated
    with check (bucket_id = 'app-pdfs' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='legal_pdfs_admin_update'
  ) then
    create policy legal_pdfs_admin_update
    on storage.objects for update to authenticated
    using (bucket_id = 'app-pdfs' and public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='legal_pdfs_admin_delete'
  ) then
    create policy legal_pdfs_admin_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'app-pdfs' and public.is_admin());
  end if;
end $$;