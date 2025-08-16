-- 1) Helper that checks if current user is admin, without triggering RLS recursion
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_admin from public.profiles
    where id = auth.uid()
  ), false);
$$;

-- only authenticated clients can call it
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- 2) Clean up old recursive policy and recreate safe ones
alter table public.profiles enable row level security;

-- self read / write
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
for select using (auth.uid() = id);

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update using (auth.uid() = id);

-- ❌ remove the old recursive admin policy
drop policy if exists profiles_select_admin on public.profiles;

-- ✅ safe admin read-all using the function (no recursion)
create policy profiles_select_admin_safe on public.profiles
for select using (public.is_admin());