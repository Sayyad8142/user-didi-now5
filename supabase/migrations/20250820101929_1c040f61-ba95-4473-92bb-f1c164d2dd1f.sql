-- PART A — Supabase SQL migration to fix Admin → Add Worker
-- 1) Ensure workers table has expected columns
alter table if exists public.workers
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists upi_id text,
  add column if not exists service_types text[],
  add column if not exists community text,
  add column if not exists photo_url text,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Unique by phone (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='workers' and indexname='workers_phone_key'
  ) then
    begin
      alter table public.workers add constraint workers_phone_key unique (phone);
    exception when duplicate_table then null; end;
  end if;
end$$;

-- 2) Admin-only RLS policy for direct table access
drop policy if exists workers_admin_write on public.workers;
create policy workers_admin_write on public.workers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Upsert RPC, admin-gated (SECURITY DEFINER + search_path)
create or replace function public.admin_upsert_worker(
  p_full_name      text,
  p_phone          text,
  p_upi_id         text,
  p_service_types  text[],
  p_community      text,
  p_photo_url      text default null,
  p_is_active      boolean default true
)
returns public.workers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workers;
begin
  if not public.is_admin() then
    raise exception 'Access denied (admin only)' using errcode = '42501';
  end if;

  -- Normalize inputs
  p_full_name := nullif(trim(p_full_name), '');
  p_phone     := nullif(regexp_replace(p_phone, '\s+', '', 'g'), '');
  p_upi_id    := nullif(trim(p_upi_id), '');
  p_community := nullif(trim(p_community), '');
  p_service_types := coalesce(p_service_types, '{}'::text[]);

  if p_full_name is null or p_phone is null or p_upi_id is null then
    raise exception 'full_name, phone, and upi_id are required';
  end if;

  -- Try insert, on conflict update by phone
  insert into public.workers (full_name, phone, upi_id, service_types, community, photo_url, is_active)
  values (p_full_name, p_phone, p_upi_id, p_service_types, p_community, p_photo_url, coalesce(p_is_active, true))
  on conflict (phone) do update
    set full_name     = excluded.full_name,
        upi_id        = excluded.upi_id,
        service_types = excluded.service_types,
        community     = excluded.community,
        photo_url     = excluded.photo_url,
        is_active     = excluded.is_active,
        updated_at    = now()
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.admin_upsert_worker(text,text,text,text[],text,text,boolean) from public;
grant execute on function public.admin_upsert_worker(text,text,text,text[],text,text,boolean) to authenticated;

-- 4) Optional: simple updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_workers_updated_at on public.workers;
create trigger trg_workers_updated_at
before update on public.workers
for each row execute function public.set_updated_at();