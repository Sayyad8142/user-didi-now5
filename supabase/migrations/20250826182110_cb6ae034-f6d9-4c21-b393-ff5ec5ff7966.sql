-- Add/ensure admin_phones setting includes current admin phone
insert into public.ops_settings(key, value)
values ('admin_phones', '919000666986')
on conflict (key) do update set value = excluded.value
where coalesce(public.ops_settings.value,'') = '';

-- Update is_admin() to also allow phone in ops_settings.admin_phones (CSV), using normalization
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_csv text;
  v_norm text;
  v_match boolean := false;
begin
  -- primary: explicit profile flag
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
    return true;
  end if;

  -- fallback: compare normalized phone against CSV in ops_settings
  select phone into v_phone from public.profiles where id = auth.uid();
  select value into v_csv from public.ops_settings where key = 'admin_phones';

  if v_phone is null or v_csv is null or length(trim(v_csv)) = 0 then
    return false;
  end if;

  v_norm := public.norm_phone(v_phone);

  -- check if any entry matches after normalization
  select true into v_match
  from (
    select public.norm_phone(trim(x)) as p from regexp_split_to_table(v_csv, '\s*,\s*') as x
  ) s
  where s.p is not null and s.p <> '' and s.p = v_norm
  limit 1;

  return coalesce(v_match, false);
end;
$$;

grant execute on function public.is_admin() to authenticated;