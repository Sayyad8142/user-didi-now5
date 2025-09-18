-- Enable outbound HTTP from Postgres
create extension if not exists pg_net with schema extensions;

-- Optional debug log (helps if nothing arrives)
create table if not exists public.pushcut_debug_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  stage text not null,
  thread_id uuid,
  message_id uuid,
  info jsonb,
  http_status int,
  error text
);

-- Detect if a row is an ADMIN message (supports multiple schemas)
create or replace function public._is_admin_message(rec anyelement)
returns boolean
language plpgsql stable
as $$
declare
  jb jsonb := to_jsonb(rec);
begin
  if (jb ? 'is_admin') and (jb->>'is_admin')::boolean then
    return true;
  end if;
  if (jb ? 'sender_role') and (jb->>'sender_role') = 'admin' then
    return true;
  end if;
  if (jb ? 'sender') and (jb->>'sender') = 'admin' then
    return true;
  end if;
  return false;
end;
$$;

-- Core notifier: POSTS to your exact Pushcut webhook
create or replace function public.pushcut_notify_support_direct(
  p_thread_id uuid,
  p_message_id uuid,
  p_title text,
  p_text  text,
  p_open_url text
) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_url text := 'https://api.pushcut.io/D6ysiDzEXvc72A67VpmkU/notifications/Maid%20app%20booking';
  resp record;
  body jsonb := jsonb_build_object(
    'title', coalesce(p_title,'New Support Message'),
    'text',  coalesce(p_text,''),
    'openUrl', p_open_url,
    'priority','high',
    'sound','alert'
  );
begin
  for resp in
    select * from extensions.net.http_post(
      url := v_url,
      headers := '{"Content-Type":"application/json"}',
      body := body::text,
      timeout_milliseconds := 8000
    )
  loop
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, http_status, error)
    values ('http', p_thread_id, p_message_id, body, resp.status, nullif(resp.error,''));
  end loop;
end;
$$;

revoke all on function public.pushcut_notify_support_direct(uuid,uuid,text,text,text) from public;
grant execute on function public.pushcut_notify_support_direct(uuid,uuid,text,text,text) to authenticated;

-- Trigger: fire on USER messages only
create or replace function public.trg_support_messages_pushcut()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  jb jsonb := to_jsonb(NEW);
  v_message text := coalesce(jb->>'message', jb->>'content', '');
  v_thread uuid := (jb->>'thread_id')::uuid;
  v_title text;
  v_text  text;
  v_open  text;
  v_name  text;
  v_phone text;
  v_service text;
  v_comm   text;
begin
  -- Log the trigger fired
  insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
  values ('trigger:fired', v_thread, (jb->>'id')::uuid, jb);

  -- Only user-originated messages
  if public._is_admin_message(NEW) then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
    values ('trigger:skip:admin_msg', v_thread, (jb->>'id')::uuid, jsonb_build_object('reason','admin origin'));
    return NEW;
  end if;

  -- Compose preview + context
  v_message := left(regexp_replace(coalesce(v_message,''), E'[\\n\\r]+', ' ', 'g'), 140);

  -- Pull user profile from thread
  select p.full_name, p.phone
    into v_name, v_phone
    from support_threads t join profiles p on p.id = t.user_id
   where t.id = v_thread;

  -- Optional booking context
  begin
    select b.service_type, coalesce(b.community, b.community_id::text)
      into v_service, v_comm
      from support_threads t join bookings b on b.id = t.booking_id
     where t.id = v_thread;
  exception when others then
    v_service := null; v_comm := null;
  end;

  v_title := coalesce(v_name, 'User') || ' sent a message';
  v_text  := coalesce(v_comm,'Community') || ' • ' ||
             coalesce(v_service,'Support') || ' • ' ||
             coalesce(v_phone,'—') || E'\n' || coalesce(v_message,'');

  -- Deep link to your admin chat (adjust if your route differs)
  -- If you host elsewhere, replace the base URL:
  v_open := '/admin/chat/' || v_thread::text;

  perform public.pushcut_notify_support_direct(v_thread, (jb->>'id')::uuid, v_title, v_text, v_open);
  return NEW;
end;
$$;

drop trigger if exists support_messages_pushcut on public.support_messages;
create trigger support_messages_pushcut
after insert on public.support_messages
for each row execute procedure public.trg_support_messages_pushcut();