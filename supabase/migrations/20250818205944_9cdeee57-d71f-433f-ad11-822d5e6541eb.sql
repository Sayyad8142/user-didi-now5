-- Ensure scheduler is available
create extension if not exists pg_cron;

-- 1) Columns to track timing
alter table public.bookings
  add column if not exists assigned_at  timestamptz,
  add column if not exists completed_at timestamptz;

-- 2) Keep a configurable window (minutes)
create table if not exists public.ops_settings (
  key   text primary key,
  value text not null
);
alter table public.ops_settings enable row level security;
drop policy if exists ops_admin_all on public.ops_settings;
create policy ops_admin_all on public.ops_settings
for all using (public.is_admin()) with check (public.is_admin());

insert into public.ops_settings (key, value)
values ('auto_complete_minutes', '45')
on conflict (key) do nothing;

-- 3) Trigger: stamp times when status changes
create or replace function public.set_booking_status_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'assigned'  and new.assigned_at  is null then new.assigned_at  := now(); end if;
    if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status = 'assigned'  and new.assigned_at  is null then new.assigned_at  := now(); end if;
      if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    end if;
    return new;
  end if;

  return new;
end
$$;

drop trigger if exists trg_booking_status_ts on public.bookings;
create trigger trg_booking_status_ts
before insert or update of status on public.bookings
for each row
execute function public.set_booking_status_timestamps();

-- Backfill assigned_at for any existing assigned rows
update public.bookings
set assigned_at = coalesce(assigned_at, confirmed_at, updated_at, created_at)
where status = 'assigned' and assigned_at is null;

-- Helpful index for the cron update
create index if not exists idx_bookings_assigned_status
  on public.bookings (status, assigned_at);

-- 4) Function: auto-complete after N minutes
create or replace function public.auto_complete_assigned()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes int := coalesce((select value::int from public.ops_settings where key='auto_complete_minutes'), 45);
begin
  update public.bookings
     set status = 'completed',
         completed_at = now()
   where status = 'assigned'
     and (coalesce(assigned_at, confirmed_at, updated_at, created_at)
          + make_interval(mins => v_minutes)) <= now();
end
$$;

-- 5) Schedule every 5 minutes
select cron.schedule(
  'didinow_auto_complete_every_5min',
  '*/5 * * * *',
  $$select public.auto_complete_assigned();$$
);