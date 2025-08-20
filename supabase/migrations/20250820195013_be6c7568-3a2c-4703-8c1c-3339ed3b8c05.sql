-- 1) Add fields on bookings to store copied worker info and payment timing
alter table public.bookings
  add column if not exists worker_name text,
  add column if not exists worker_phone text,
  add column if not exists worker_upi text,
  add column if not exists worker_photo_url text,
  add column if not exists pay_enabled_at timestamptz,
  add column if not exists user_marked_paid_at timestamptz;

-- 2) Ratings table: one rating per booking (by booking owner)
create table if not exists public.worker_ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete set null,
  user_id uuid not null,
  rating int2 not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_ratings_worker on public.worker_ratings(worker_id);

alter table public.worker_ratings enable row level security;

-- Only the booking owner can insert/select their rating row; admins can see all
create policy wr_insert on public.worker_ratings
for insert to authenticated
with check (
  exists (
    select 1 from public.bookings b
    where b.id = worker_ratings.booking_id
      and b.user_id = auth.uid()
  )
);

create policy wr_select on public.worker_ratings
for select to authenticated
using (
  user_id = auth.uid() or public.is_admin()
);

-- 3) Aggregated rating view for quick display (avg + count per worker)
create or replace view public.worker_rating_stats as
select
  worker_id,
  avg(rating)::numeric(3,2) as avg_rating,
  count(*)::int as ratings_count
from public.worker_ratings
group by worker_id;

grant select on public.worker_rating_stats to authenticated;

-- 4) Update assign_worker_to_booking to copy worker fields + set pay_enabled_at
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
  v_w public.workers;
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

  -- Get worker details
  select * into v_w from public.workers where id = p_worker_id;
  if not found then 
    raise exception 'Worker not found';
  end if;

  -- Compute minutes per service with fallback 45
  v_minutes := public.get_setting_int('auto_complete_after_minutes.' || v_b.service_type, 45);

  update public.bookings
  set status = 'assigned',
      assigned_at = coalesce(assigned_at, now()),
      worker_id = p_worker_id,
      worker_name = v_w.full_name,
      worker_phone = v_w.phone,
      worker_upi = v_w.upi_id,
      worker_photo_url = v_w.photo_url,
      pay_enabled_at = coalesce(pay_enabled_at, now() + interval '30 minutes'),
      auto_complete_after_minutes = v_minutes,
      auto_complete_at = now() + (v_minutes || ' minutes')::interval,
      updated_at = now()
  where id = p_booking_id
  returning * into v_b;

  return v_b;
end
$$;

-- 5) Trigger to copy worker details when worker_id changes
create or replace function public.copy_worker_into_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare 
  w public.workers;
begin
  if new.worker_id is null then
    -- clear if unassigned
    new.worker_name := null; 
    new.worker_phone := null; 
    new.worker_upi := null; 
    new.worker_photo_url := null;
    return new;
  end if;

  select * into w from public.workers where id = new.worker_id;
  if found then
    new.worker_name := w.full_name;
    new.worker_phone := w.phone;
    new.worker_upi := w.upi_id;
    new.worker_photo_url := w.photo_url;
  end if;
  return new;
end
$$;

create trigger trigger_copy_worker_into_booking
  before insert or update on public.bookings
  for each row execute function public.copy_worker_into_booking();