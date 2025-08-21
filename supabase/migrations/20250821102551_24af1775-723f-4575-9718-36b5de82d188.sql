-- 1) Make the logged-in owner an admin (one-time bootstrap by phone)
-- Update any matching profile rows for the owner number
update public.profiles
set is_admin = true
where coalesce(replace(replace(phone,'+',''), ' ', ''), '') in (
  '919000666986','9000666986'
);

-- 2) Drop and recreate is_admin function with proper security definer
drop function if exists public.is_admin();
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

-- 3) Drop existing functions and recreate with proper security
drop function if exists public.admin_get_web_version();
drop function if exists public.admin_set_web_version(text, boolean);

create or replace function public.admin_get_web_version()
returns table (web_version text, force boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  return query
  select
    coalesce((select value from public.ops_settings where key='web_version'), 'v1.0.0')::text as web_version,
    coalesce((select value from public.ops_settings where key='force_updates')::boolean, false) as force;
end;
$$;

create or replace function public.admin_set_web_version(new_version text, force boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  insert into public.ops_settings(key, value) values('web_version', new_version)
  on conflict (key) do update set value = excluded.value;

  insert into public.ops_settings(key, value) values('force_updates', force::text)
  on conflict (key) do update set value = excluded.value;
end;
$$;

grant execute on function public.admin_get_web_version() to authenticated;
grant execute on function public.admin_set_web_version(text, boolean) to authenticated;