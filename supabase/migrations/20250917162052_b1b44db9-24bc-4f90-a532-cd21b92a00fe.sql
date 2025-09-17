-- 0) Extensions
create extension if not exists pg_net with schema extensions;

-- 1) Debug log (to see what actually happens)
create table if not exists public.pushcut_debug_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  stage text not null,              -- e.g. 'trigger', 'notify', 'http'
  thread_id uuid,
  message_id uuid,
  info jsonb,                       -- payload/context
  http_status int,
  error text
);

-- 2) Settings helpers
create table if not exists public.ops_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.get_ops_setting(p_key text)
returns text
language sql stable
as $$ select value from public.ops_settings where key = p_key $$;

-- 3) Throttle table
create table if not exists public.support_pushcut_throttle (
  thread_id uuid primary key,
  last_notified_at timestamptz not null default '1970-01-01'
);

-- 4) Robust admin detection: supports is_admin, sender, sender_role
create or replace function public._is_admin_message(rec anyelement)
returns boolean
language plpgsql stable
as $$
declare
  jb jsonb := to_jsonb(rec);
  v_is_admin boolean;
  v_sender text;
  v_role   text;
begin
  v_is_admin := (jb ? 'is_admin') and ( (jb->>'is_admin')::boolean );
  if v_is_admin then return true; end if;

  v_role := jb->>'sender_role';
  if v_role is not null and v_role = 'admin' then return true; end if;

  v_sender := jb->>'sender';
  if v_sender is not null and v_sender = 'admin' then return true; end if;

  return false; -- default: user
end;
$$;

-- 5) Core notifier WITH DEBUG LOGGING
create or replace function public.pushcut_notify_support(
  p_thread_id uuid,
  p_message_id uuid,
  p_preview text,
  p_user_name text,
  p_user_phone text,
  p_service text,
  p_community text
) returns void
language plpgsql security definer
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
  resp record;
begin
  if v_url is null or v_url = '' then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, error)
    values ('notify:skip:no_url', p_thread_id, p_message_id, jsonb_build_object('preview',p_preview), 'pushcut_support_webhook_url not set');
    return;
  end if;

  -- throttle
  select last_notified_at into v_last from public.support_pushcut_throttle where thread_id = p_thread_id;
  if v_last is not null and extract(epoch from (v_now - v_last)) < v_throttle_seconds then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
    values ('notify:skip:throttled', p_thread_id, p_message_id, jsonb_build_object('since_sec', extract(epoch from (v_now - v_last))));
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
    'input', jsonb_build_object('threadId', p_thread_id::text, 'messageId', p_message_id::text)
  );

  for resp in
    select * from extensions.net.http_post(
      url := v_url,
      headers := '{"Content-Type":"application/json"}',
      body := v_body::text,
      timeout_milliseconds := 8000
    )
  loop
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, http_status, error)
    values ('http', p_thread_id, p_message_id, v_body, resp.status, nullif(resp.error, ''));
  end loop;

  -- set throttle
  insert into public.support_pushcut_throttle(thread_id, last_notified_at)
  values (p_thread_id, v_now)
  on conflict (thread_id) do update set last_notified_at = excluded.last_notified_at;
end;
$$;

revoke all on function public.pushcut_notify_support(uuid,uuid,text,text,text,text,text) from public;
grant execute on function public.pushcut_notify_support(uuid,uuid,text,text,text,text,text) to authenticated;

-- 6) Trigger: tolerant to column name differences (content/message)
create or replace function public.trg_support_messages_pushcut()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  jb jsonb := to_jsonb(NEW);
  v_content text := coalesce(jb->>'content', jb->>'message', '');
  v_user_name text;
  v_user_phone text;
  v_service text;
  v_community text;
  v_preview text;
begin
  -- Debug: fired
  insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
  values ('trigger:fired', (jb->>'thread_id')::uuid, (jb->>'id')::uuid, jb);

  -- only user messages
  if public._is_admin_message(NEW) then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
    values ('trigger:skip:admin_msg', (jb->>'thread_id')::uuid, (jb->>'id')::uuid, jsonb_build_object('reason','admin message'));
    return NEW;
  end if;

  -- preview
  v_preview := left(regexp_replace(coalesce(v_content,''), E'[\\n\\r]+', ' ', 'g'), 140);

  -- user profile from thread
  select p.full_name, p.phone
  into v_user_name, v_user_phone
  from support_threads t
  join profiles p on p.id = t.user_id
  where t.id = (jb->>'thread_id')::uuid;

  -- booking context if any
  begin
    select b.service_type, coalesce(b.community, b.community_id::text)
    into v_service, v_community
    from support_threads t
    join bookings b on b.id = t.booking_id
    where t.id = (jb->>'thread_id')::uuid;
  exception when others then
    v_service := null; v_community := null;
  end;

  perform public.pushcut_notify_support(
    p_thread_id := (jb->>'thread_id')::uuid,
    p_message_id := (jb->>'id')::uuid,
    p_preview := v_preview,
    p_user_name := v_user_name,
    p_user_phone := v_user_phone,
    p_service := v_service,
    p_community := v_community
  );

  return NEW;
end;
$$;

drop trigger if exists support_messages_pushcut on public.support_messages;
create trigger support_messages_pushcut
after insert on public.support_messages
for each row execute procedure public.trg_support_messages_pushcut();