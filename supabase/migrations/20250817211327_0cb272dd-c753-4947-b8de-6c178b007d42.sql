-- 1) Enum for maid tasks (create if missing)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'maid_task') then
    create type maid_task as enum ('floor_cleaning','dish_washing');
  end if;
end$$;

-- 2) Price table per flat size & task (community optional)
create table if not exists public.maid_pricing_tasks (
  flat_size text not null check (flat_size in ('2BHK','2.5BHK','3BHK','3.5BHK','4BHK')),
  task maid_task not null,
  price_inr integer not null check (price_inr >= 0),
  community text null,
  active boolean not null default true,
  primary key (flat_size, task, community)
);
alter table public.maid_pricing_tasks enable row level security;

-- Public can read, only admins can write
drop policy if exists mpt_select on public.maid_pricing_tasks;
create policy mpt_select on public.maid_pricing_tasks
  for select using (true);

drop policy if exists mpt_admin_write on public.maid_pricing_tasks;
create policy mpt_admin_write on public.maid_pricing_tasks
  for all using (public.is_admin()) with check (public.is_admin());

-- 3) Seed default prices (each task has same base price per size)
insert into public.maid_pricing_tasks(flat_size, task, price_inr, community)
values
 ('2BHK','floor_cleaning',100,null), ('2BHK','dish_washing',100,null),
 ('2.5BHK','floor_cleaning',110,null), ('2.5BHK','dish_washing',110,null),
 ('3BHK','floor_cleaning',120,null), ('3BHK','dish_washing',120,null),
 ('3.5BHK','floor_cleaning',130,null), ('3.5BHK','dish_washing',130,null),
 ('4BHK','floor_cleaning',150,null), ('4BHK','dish_washing',150,null)
on conflict do nothing;

-- 4) Store selected tasks on bookings
alter table public.bookings
  add column if not exists maid_tasks maid_task[];

-- (Optional) helper: compute maid price in DB if needed later
create or replace function public.maid_total_price(p_flat text, p_tasks maid_task[], p_community text default null)
returns integer
language sql stable as $$
  with rows as (
    select price_inr
    from public.maid_pricing_tasks
    where active = true
      and flat_size = p_flat
      and (community is null or community = p_community)
      and task = any(p_tasks)
    order by community nulls first
  )
  select coalesce(sum(price_inr),0) from rows;
$$;