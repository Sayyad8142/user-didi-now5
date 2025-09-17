-- Enable HTTP from Postgres
create extension if not exists pg_net with schema extensions;

-- Add Pushcut webhook for SUPPORT messages
insert into public.ops_settings(key, value)
values
  ('pushcut_support_webhook_url', 'https://api.pushcut.io/REPLACE_ME/notifications/Support%20Message')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Admin web base (used to build deep links from the notification)
insert into public.ops_settings(key, value)
values
  ('admin_base_url', 'https://admin.didinow.com')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Throttle table: last time we pushed for a thread (to avoid spam)
create table if not exists public.support_pushcut_throttle (
  thread_id uuid primary key,
  last_notified_at timestamptz not null default '1970-01-01'
);

-- Helper: read ops setting
create or replace function public.get_ops_setting(p_key text)
returns text
language sql
stable
as $$
  select value from public.ops_settings where key = p_key
$$;

-- Compose and send Pushcut for a support message
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
  if v_url is null or v_url = '' or v_url = 'https://api.pushcut.io/REPLACE_ME/notifications/Support%20Message' then
    -- silently skip if not configured
    return;
  end if;

  -- Throttle per thread
  select last_notified_at into v_last from public.support_pushcut_throttle where thread_id = p_thread_id;
  if v_last is not null and extract(epoch from (v_now - v_last)) < v_throttle_seconds then
    return;
  end if;

  v_title := coalesce(p_user_name, 'User') || ' sent a message';
  v_text  := coalesce(p_community, 'Community') || ' • ' ||
             coalesce(p_service, 'Support') || ' • ' ||
             coalesce(p_user_phone, '—') || E'\n' ||
             coalesce(p_preview, '');

  v_body := jsonb_build_object(
    'title', v_title,
    'text',  v_text,
    'url', v_open,
    'sound', 'alert',
    'input', jsonb_build_object(
      'threadId', p_thread_id::text,
      'messageId', p_message_id::text
    )
  );

  -- Push to Pushcut
  perform
    extensions.http_post(
      v_url,
      v_body::text,
      'application/json'
    );

  -- Upsert throttle timestamp
  insert into public.support_pushcut_throttle(thread_id, last_notified_at)
  values (p_thread_id, v_now)
  on conflict (thread_id) do update set last_notified_at = excluded.last_notified_at;
end;
$$;

-- Trigger function for support_messages inserts (user messages only)
create or replace function public.trg_support_messages_pushcut()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_name text;
  v_user_phone text;
  v_service text;
  v_community text;
  v_preview text;
  v_is_admin boolean := false;
begin
  -- Detect admin vs user sender based on sender column
  v_is_admin := (NEW.sender = 'admin');

  -- Only notify on user messages
  if v_is_admin then
    return NEW;
  end if;

  -- Build a short preview (first 120 chars, single-line)
  v_preview := left(regexp_replace(coalesce(NEW.message, ''), E'[\\n\\r]+', ' ', 'g'), 120);

  -- Pull user context from thread -> profile
  select p.full_name, p.phone
    into v_user_name, v_user_phone
    from support_threads t
    join profiles p on p.id = t.user_id
   where t.id = NEW.thread_id;

  -- If support thread has booking context, get service and community
  begin
    select b.service_type, b.community
      into v_service, v_community
      from support_threads t
      join bookings b on b.id = t.booking_id
     where t.id = NEW.thread_id;
  exception when others then
    -- Default to general support if no booking context
    v_service := 'Support';
    v_community := coalesce(v_community, 'General');
  end;

  perform public.pushcut_notify_support(
    p_thread_id := NEW.thread_id,
    p_message_id := NEW.id,
    p_preview := v_preview,
    p_user_name := v_user_name,
    p_user_phone := v_user_phone,
    p_service := v_service,
    p_community := v_community
  );

  return NEW;
end;
$$;

-- Create trigger for support messages
drop trigger if exists support_messages_pushcut on public.support_messages;
create trigger support_messages_pushcut
after insert on public.support_messages
for each row
execute procedure public.trg_support_messages_pushcut();