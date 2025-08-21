-- KV store for app settings (admin-only)
create table if not exists public.ops_settings (
  key   text primary key,
  value text not null
);

alter table public.ops_settings enable row level security;

drop policy if exists ops_admin_all on public.ops_settings;
create policy ops_admin_all on public.ops_settings
for all
using (public.is_admin())
with check (public.is_admin());

-- Ensure required keys exist once
insert into public.ops_settings (key, value) values
  ('web_version','v1.0.0'),
  ('force_updates','false')
on conflict (key) do nothing;

-- ADMIN: read current version + force flag
create or replace function public.admin_get_web_version()
returns table(web_version text, force boolean)
language sql
security definer
set search_path = public
as $$
  select
    coalesce((select value from public.ops_settings where key='web_version'),'v1.0.0') as web_version,
    coalesce((select value from public.ops_settings where key='force_updates'),'false')::boolean as force;
$$;

-- ADMIN: set version + force flag
create or replace function public.admin_set_web_version(new_version text, force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied' using errcode='42501';
  end if;

  insert into public.ops_settings(key,value)
  values ('web_version', new_version)
  on conflict (key) do update set value = excluded.value;

  insert into public.ops_settings(key,value)
  values ('force_updates', case when force then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end;
$$;