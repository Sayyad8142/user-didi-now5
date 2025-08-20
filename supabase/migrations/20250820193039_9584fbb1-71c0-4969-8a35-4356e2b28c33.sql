-- 1) Ensure ops_settings exists (key/value text, admin-only RLS is already set in this project)
create table if not exists public.ops_settings (
  key   text primary key,
  value text not null
);

-- 2) Seed per-service minutes (can be edited later in Admin → Settings)
insert into public.ops_settings(key, value) values
  ('auto_complete_after_minutes.maid', '50'),
  ('auto_complete_after_minutes.cook', '60'),
  ('auto_complete_after_minutes.bathroom_cleaning', '75')
on conflict (key) do update set value = excluded.value;

-- 3) Helper to fetch integer settings with default
create or replace function public.get_setting_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce( nullif(value, '')::int, p_default )
  from public.ops_settings
  where key = p_key
  union all
  select p_default
  limit 1
$$;

-- 4) Add columns on bookings to persist auto-complete timing (idempotent)
alter table public.bookings
  add column if not exists auto_complete_after_minutes int,
  add column if not exists auto_complete_at timestamptz;

-- 5) When a booking becomes assigned, set auto_complete_after_minutes and auto_complete_at.

-- If you already have an assign_worker_to_booking() RPC, patch it; otherwise create/replace it.
-- This version assumes booking_id exists and status transitions to 'assigned' here.
create or replace function public.assign_worker_to_booking(
  p_booking_id uuid,
  p_worker_id uuid,
  p_assigned_by uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.bookings;
  v_minutes int;
begin
  if not public.is_admin() then
    raise exception 'Access denied (admin only)' using errcode = '42501';
  end if;

  -- Lock row to avoid double-assign
  select * into v_b
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_b.status <> 'pending' then
    raise exception 'Booking is already %', v_b.status;
  end if;

  -- Compute minutes per service with fallback 45
  v_minutes := public.get_setting_int('auto_complete_after_minutes.' || v_b.service_type, 45);

  update public.bookings
  set status = 'assigned',
      assigned_at = coalesce(assigned_at, now()),
      worker_id = p_worker_id,
      auto_complete_after_minutes = v_minutes,
      auto_complete_at = now() + (v_minutes || ' minutes')::interval,
      updated_at = now()
  where id = p_booking_id
  returning * into v_b;

  -- optional: insert into assignments, audit, etc. (keep your existing logic)
  return v_b;
end
$$;

revoke all on function public.assign_worker_to_booking(uuid, uuid, uuid) from public;
grant execute on function public.assign_worker_to_booking(uuid, uuid, uuid) to authenticated;

-- 6) Cron function to complete assigned bookings when due (uses auto_complete_at if present, else computed)
create or replace function public.auto_complete_assigned()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.bookings b
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where b.status = 'assigned'
    and now() >= coalesce(
      b.auto_complete_at,
      b.assigned_at + (
        (public.get_setting_int('auto_complete_after_minutes.' || b.service_type, 45))::text || ' minutes'
      )::interval
    );

  get diagnostics v_count = row_count;
  -- optional: RAISE NOTICE 'auto completed % rows', v_count;
end
$$;

-- 7) Performance indexes
create index if not exists idx_bookings_status_created on public.bookings(status, created_at desc);
create index if not exists idx_bookings_auto_complete_at on public.bookings(auto_complete_at);