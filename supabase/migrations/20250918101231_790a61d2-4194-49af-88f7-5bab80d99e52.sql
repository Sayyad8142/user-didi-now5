-- 1) Ensure basic structure & types (safe/idempotent)
create extension if not exists pgcrypto; -- for gen_random_uuid()
create extension if not exists pg_trgm;

-- Update support_threads structure
ALTER TABLE public.support_threads 
ADD COLUMN IF NOT EXISTS last_sender text;

-- Add constraint if it doesn't exist
DO $$ 
BEGIN
    ALTER TABLE public.support_threads 
    ADD CONSTRAINT check_last_sender CHECK (last_sender IN ('user','admin'));
EXCEPTION 
    WHEN duplicate_object THEN NULL;
END $$;

-- Update support_messages structure - change ID to UUID and add proper sender column
DO $$
BEGIN
    -- Drop existing support_messages table and recreate with proper structure
    DROP TABLE IF EXISTS public.support_messages CASCADE;
    
    CREATE TABLE public.support_messages (
      id uuid primary key default gen_random_uuid(),
      thread_id uuid not null references public.support_threads(id) on delete cascade,
      sender text not null check (sender in ('user','admin')),
      message text not null,
      seen boolean not null default false,
      seen_at timestamptz,
      created_at timestamptz not null default now()
    );
END $$;

-- Helpful indexes
create index if not exists support_messages_thread_created_idx on public.support_messages(thread_id, created_at);
create index if not exists support_threads_user_updated_idx on public.support_threads(user_id, updated_at);

-- 2) Trigger: keep thread metadata in sync
create or replace function public.update_support_thread_on_message()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.support_threads
     set last_message = left(new.message, 140),
         last_sender  = new.sender,
         updated_at   = now()
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_update_support_thread_on_message on public.support_messages;
create trigger trg_update_support_thread_on_message
after insert on public.support_messages
for each row execute procedure public.update_support_thread_on_message();

-- 3) RLS: strict & correct
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

-- Drop all existing policies first
drop policy if exists st_user_select on public.support_threads;
drop policy if exists st_user_modify on public.support_threads;
drop policy if exists st_admin_all on public.support_threads;
drop policy if exists st_user_insert on public.support_threads;
drop policy if exists st_user_own on public.support_threads;
drop policy if exists st_user_update on public.support_threads;

drop policy if exists sm_user_select on public.support_messages;
drop policy if exists sm_user_insert on public.support_messages;
drop policy if exists sm_admin_all on public.support_messages;
drop policy if exists support_messages_user_insert_own_thread on public.support_messages;
drop policy if exists support_messages_user_select_own_thread on public.support_messages;
drop policy if exists support_messages_user_update_own_thread on public.support_messages;

-- Threads: users see their own; admins see all
create policy st_user_select on public.support_threads
for select using (user_id = auth.uid());

create policy st_user_modify on public.support_threads
for update using (user_id = auth.uid());

create policy st_user_insert on public.support_threads
for insert with check (user_id = auth.uid());

create policy st_admin_all on public.support_threads
for all using (is_admin()) with check (is_admin());

-- Messages: users can read/write their thread; admins all
create policy sm_user_select on public.support_messages
for select using (
  exists (select 1 from public.support_threads t where t.id = support_messages.thread_id and t.user_id = auth.uid())
);

create policy sm_user_insert on public.support_messages
for insert with check (
  sender = 'user' and
  exists (select 1 from public.support_threads t where t.id = support_messages.thread_id and t.user_id = auth.uid())
);

create policy sm_admin_all on public.support_messages
for all using (is_admin()) with check (is_admin());

-- Optional: if you UPDATE messages (e.g., mark seen), keep old row visible to realtime
alter table public.support_messages replica identity full;

-- 4) Realtime publication (ensure table is in supabase_realtime)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname='public' and tablename='support_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.support_messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname='public' and tablename='support_threads'
  ) then
    execute 'alter publication supabase_realtime add table public.support_threads';
  end if;
end$$;