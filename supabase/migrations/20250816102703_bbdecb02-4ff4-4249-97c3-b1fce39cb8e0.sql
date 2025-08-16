-- 1) Table shape (create if missing; else only add columns)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  community text,
  flat_no text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

-- 2) RLS
alter table public.profiles enable row level security;

-- Users can see/insert/update their own profile
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
for select using (auth.uid() = id);

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update using (auth.uid() = id);

-- (Optional) Admins can read all profiles (useful for stats)
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
for select using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
));

-- 3) Make sure your admin profile is flagged
update public.profiles
set is_admin = true
where phone in ('+919000666986');