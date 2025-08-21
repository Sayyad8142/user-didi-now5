-- 0) Admin phone whitelist in ops_settings (normalized numbers: no '+')
insert into public.ops_settings(key,value) values
  ('admin_phones','919000666986,9000666986')
on conflict (key) do update set value = excluded.value;

-- 1) Helper: normalize phone to digits, ensure India E.164 (prepend 91 if 10 digits)
create or replace function public.norm_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then ''
    else
      case
        when regexp_replace(p,'\D','','g') ~ '^\d{10}$'
          then '91' || regexp_replace(p,'\D','','g')
        when regexp_replace(p,'\D','','g') ~ '^91\d{10}$'
          then regexp_replace(p,'\D','','g')
        else regexp_replace(p,'\D','','g')
      end
  end
$$;

-- 2) Hardened admin check: profile flag OR phone in admin_phones
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  u_phone text := '';
  u_norm  text := '';
  wl      text := coalesce((select value from public.ops_settings where key='admin_phones'),'');
  wl_arr  text[];
begin
  -- A) Profile flag
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
    return true;
  end if;

  -- B) Phone whitelist (profile.phone first, fallback to auth.users.phone)
  select coalesce(p.phone, u.phone) into u_phone
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid();

  u_norm := public.norm_phone(u_phone);
  wl_arr := string_to_array(replace(wl,' ','') , ',');

  if u_norm <> '' and wl_arr is not null and u_norm = any(wl_arr) then
    return true;
  end if;

  return false;
end;
$$;

-- 3) Ensure web version RPCs stay secured (recreate safely)
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
    coalesce((select value from public.ops_settings where key='web_version'),'v1.0.0')::text,
    coalesce((select value from public.ops_settings where key='force_updates')::boolean, false);
end;
$$;

create or replace function public.admin_set_web_version(new_version text, force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  insert into public.ops_settings(key,value) values('web_version', new_version)
  on conflict (key) do update set value = excluded.value;

  insert into public.ops_settings(key,value) values('force_updates', force::text)
  on conflict (key) do update set value = excluded.value;
end;
$$;

grant execute on function public.admin_get_web_version() to authenticated;
grant execute on function public.admin_set_web_version(text, boolean) to authenticated;