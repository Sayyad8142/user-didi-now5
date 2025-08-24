-- Create support threads and messages tables
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  last_message text,
  last_sender text check (last_sender in ('user','admin')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.support_messages (
  id bigserial primary key,
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender text not null check (sender in ('user','admin')),
  message text not null,
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  seen_at timestamptz null
);

-- Enable RLS
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

-- RLS policies for threads
drop policy if exists st_user_select on public.support_threads;
create policy st_user_select on public.support_threads
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists st_user_insert on public.support_threads;
create policy st_user_insert on public.support_threads
for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists st_user_update on public.support_threads;
create policy st_user_update on public.support_threads
for update using (user_id = auth.uid() or public.is_admin());

-- RLS policies for messages
drop policy if exists sm_user_select on public.support_messages;
create policy sm_user_select on public.support_messages
for select using (
  exists(select 1 from public.support_threads t where t.id=thread_id and (t.user_id = auth.uid() or public.is_admin()))
);

drop policy if exists sm_user_insert on public.support_messages;
create policy sm_user_insert on public.support_messages
for insert with check (
  exists(select 1 from public.support_threads t where t.id=thread_id and (t.user_id = auth.uid() or public.is_admin()))
);

-- Function to update thread summary
create or replace function public.support_update_thread()
returns trigger language plpgsql as $$
begin
  update public.support_threads
  set last_message = new.message,
      last_sender  = new.sender,
      updated_at   = new.created_at
  where id = new.thread_id;
  return new;
end$$;

-- Trigger to maintain thread summary
drop trigger if exists trg_support_update_thread on public.support_messages;
create trigger trg_support_update_thread
after insert on public.support_messages
for each row execute function public.support_update_thread();