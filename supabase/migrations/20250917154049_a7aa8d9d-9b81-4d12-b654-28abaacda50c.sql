-- 0) Extensions
create extension if not exists pg_net with schema extensions;

-- 1) Settings store (fix for existing ops_settings table)
-- First add the missing updated_at column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'ops_settings' 
    and column_name = 'updated_at'
    and table_schema = 'public'
  ) then
    alter table public.ops_settings add column updated_at timestamptz not null default now();
  end if;
end $$;

-- Insert Pushcut settings
insert into public.ops_settings(key, value) values
  ('pushcut_support_webhook_url', 'https://api.pushcut.io/REPLACE_ME/notifications/Support%20Message'),
  ('admin_base_url', 'https://admin.didinow.com')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2) Per-thread throttle to avoid spam (60s default)
create table if not exists public.support_pushcut_throttle (
  thread_id uuid primary key,
  last_notified_at timestamptz not null default '1970-01-01'
);

-- 3) Sender-role detector: returns true if the message row is from admin
create or replace function public._is_admin_message(rec anyelement)
returns boolean
language plpgsql
stable
as $$
declare
  v_is_admin boolean := false;
begin
  begin
    execute 'select ($1).is_admin' using rec into v_is_admin;
    if v_is_admin is not null then
      return v_is_admin;
    end if;
  exception when undefined_column then
    -- ignore
  end;

  begin
    -- if you use sender='admin' text
    declare v_sender text;
    execute 'select ($1).sender' using rec into v_sender;
    if v_sender is not null then
      return v_sender = 'admin';
    end if;
  exception when undefined_column then
    -- ignore
  end;

  return false; -- default assume user
end;
$$;

-- 4) Core notifier
create or replace function public.pushcut_notify_support(
  p_thread_id uuid,
  p_message_id bigint,
  p_preview text,
  p_user_name text,
  p_user_phone text,
  p_service text,
  p_community text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := public.get_ops_setting('pushcut_support_webhook_url');
  v_admin_base text := coalesce(public.get_ops_setting('admin_base_url'), 'https://admin.didinow.com');
  v_open text := v_admin_base || '/admin/chat/' || p_thread_id::text;
  v_now timestamptz := now();
  v_last timestamptz;
  v_throttle_seconds int := 60;
  v_body jsonb;
  v_title text;
  v_text  text;
begin
  if v_url is null or v_url = '' or v_url like '%REPLACE_ME%' then
    return;
  end if;

  -- throttle
  select last_notified_at into v_last from public.support_pushcut_throttle where thread_id = p_thread_id;
  if v_last is not null and extract(epoch from (v_now - v_last)) < v_throttle_seconds then
    return;
  end if;

  v_title := coalesce(p_user_name, 'User') || ' sent a message';
  v_text  := coalesce(p_community, 'Community') || ' • ' ||
             coalesce(p_service, 'Support')   || ' • ' ||
             coalesce(p_user_phone, '—')      || E'\n' ||
             coalesce(p_preview, '');

  v_body := jsonb_build_object(
    'title', v_title,
    'text',  v_text,
    'openUrl', v_open,
    'priority', 'high',
    'sound', 'alert',
    'input', jsonb_build_object(
      'threadId', p_thread_id::text,
      'messageId', p_message_id::text
    )
  );

  perform extensions.net.http_post(
    url := v_url,
    headers := '{"Content-Type":"application/json"}',
    body := v_body::text,
    timeout_milliseconds := 8000
  );

  insert into public.support_pushcut_throttle(thread_id, last_notified_at)
  values (p_thread_id, v_now)
  on conflict (thread_id) do update set last_notified_at = excluded.last_notified_at;
end;
$$;

-- 5) Trigger function (user messages only)
create or replace function public.trg_support_messages_pushcut()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_name text;
  v_user_phone text;
  v_service text;
  v_community text;
  v_preview text;
begin
  -- only on user messages
  if public._is_admin_message(NEW) then
    return NEW;
  end if;

  -- compact single-line preview
  v_preview := left(regexp_replace(coalesce(NEW.message, ''), E'[\\n\\r]+', ' ', 'g'), 140);

  -- user context from thread -> profile
  select p.full_name, p.phone
  into v_user_name, v_user_phone
  from support_threads t
  join profiles p on p.id = t.user_id
  where t.id = NEW.thread_id;

  -- booking context if thread is linked
  begin
    select b.service_type, b.community
    into v_service, v_community
    from support_threads t
    join bookings b on b.id = t.booking_id
    where t.id = NEW.thread_id;
  exception when others then
    v_service := 'General Support';
    v_community := null;
  end;

  perform public.pushcut_notify_support(
    p_thread_id := NEW.thread_id,
    p_message_id := NEW.id,
    p_preview := v_preview,
    p_user_name := v_user_name,
    p_user_phone := v_user_phone,
    p_service := coalesce(v_service, 'General Support'),
    p_community := v_community
  );

  return NEW;
end;
$$;

drop trigger if exists support_messages_pushcut on public.support_messages;
create trigger support_messages_pushcut
after insert on public.support_messages
for each row
execute procedure public.trg_support_messages_pushcut();

-- 6) Grants (trigger runs as definer; allow rpc usage if you ever call it directly)
revoke all on function public.pushcut_notify_support(uuid,bigint,text,text,text,text,text) from public;
grant execute on function public.pushcut_notify_support(uuid,bigint,text,text,text,text,text) to authenticated;

-- 7) Helpful indexes
create index if not exists support_messages_thread_created_idx on public.support_messages(thread_id, created_at);