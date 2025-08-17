-- Ensure maid_pricing_tasks has a solid primary key using community=''
alter table public.maid_pricing_tasks
  alter column community set default '';
update public.maid_pricing_tasks set community = '' where community is null;
alter table public.maid_pricing_tasks
  alter column community set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maid_pricing_tasks_pk'
  ) then
    alter table public.maid_pricing_tasks
      add constraint maid_pricing_tasks_pk primary key (flat_size, task, community);
  end if;
end$$;

-- Cook pricing settings (simple singleton per community; use '' for global)
create table if not exists public.cook_pricing_settings (
  community text not null default '',
  base_price_inr integer not null default 200,
  non_veg_extra_inr integer not null default 50,
  per_extra_person_inr integer not null default 20,
  updated_at timestamptz not null default now(),
  primary key (community)
);
alter table public.cook_pricing_settings enable row level security;

drop policy if exists cook_settings_read on public.cook_pricing_settings;
create policy cook_settings_read on public.cook_pricing_settings for select using (true);

drop policy if exists cook_settings_write on public.cook_pricing_settings;
create policy cook_settings_write on public.cook_pricing_settings
for all using (public.is_admin()) with check (public.is_admin());

-- Seed global (does nothing if exists)
insert into public.cook_pricing_settings(community, base_price_inr, non_veg_extra_inr, per_extra_person_inr)
values ('',200,50,20)
on conflict (community) do nothing;