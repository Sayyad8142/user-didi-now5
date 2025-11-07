-- Create rtc_calls table for in-app VoIP calling
create table public.rtc_calls (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  caller_id uuid not null,
  callee_id uuid not null,
  vendor text not null default 'daily',
  room_id text not null,
  status text not null default 'initiated',
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add index for faster queries
create index idx_rtc_calls_booking_id on public.rtc_calls(booking_id);
create index idx_rtc_calls_caller_id on public.rtc_calls(caller_id);
create index idx_rtc_calls_callee_id on public.rtc_calls(callee_id);
create index idx_rtc_calls_status on public.rtc_calls(status);

-- Enable RLS
alter table public.rtc_calls enable row level security;

-- RLS Policies: caller or callee can read rows they are involved in
create policy "party_read" on public.rtc_calls
  for select 
  using (caller_id = auth.uid() or callee_id = auth.uid());

-- Only caller can insert their own row
create policy "caller_insert" on public.rtc_calls
  for insert 
  with check (caller_id = auth.uid());

-- Either party can update rows they're on
create policy "party_update" on public.rtc_calls
  for update 
  using (caller_id = auth.uid() or callee_id = auth.uid());

-- Trigger to update updated_at
create trigger update_rtc_calls_updated_at
  before update on public.rtc_calls
  for each row
  execute function public.touch_updated_at();

-- Helper function to get booking participants
create or replace function public.get_booking_participants(p_booking_id uuid)
returns table(user_id uuid, worker_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, worker_id
  from bookings
  where id = p_booking_id;
$$;

-- Grant permissions
grant select, insert, update on public.rtc_calls to authenticated;
grant execute on function public.get_booking_participants to authenticated;