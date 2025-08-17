-- Add field on bookings to store the count
alter table public.bookings
  add column if not exists bathroom_count integer
  check (bathroom_count is null or bathroom_count >= 1);

-- Simple settings table: unit price per community ('' = global)
create table if not exists public.bathroom_pricing_settings (
  community text not null default '',
  unit_price_inr integer not null default 250,
  updated_at timestamptz not null default now(),
  primary key (community)
);
alter table public.bathroom_pricing_settings enable row level security;

drop policy if exists bath_settings_read on public.bathroom_pricing_settings;
create policy bath_settings_read on public.bathroom_pricing_settings for select using (true);

drop policy if exists bath_settings_write on public.bathroom_pricing_settings;
create policy bath_settings_write on public.bathroom_pricing_settings
for all using (public.is_admin()) with check (public.is_admin());

-- Seed global price if missing
insert into public.bathroom_pricing_settings(community, unit_price_inr)
values ('', 250)
on conflict (community) do nothing;

-- Helper to compute total in SQL (optional)
create or replace function public.bath_total_price(p_count int, p_community text default '')
returns integer
language sql stable as $$
  with pick as (
    select unit_price_inr from public.bathroom_pricing_settings
    where community = coalesce(p_community,'')
    union all
    select unit_price_inr from public.bathroom_pricing_settings
    where community = '' limit 1
  )
  select coalesce((select unit_price_inr from pick limit 1), 250) * greatest(p_count,1);
$$;