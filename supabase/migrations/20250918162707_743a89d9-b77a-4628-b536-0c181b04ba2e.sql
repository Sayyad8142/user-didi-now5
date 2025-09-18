-- 0) Make sure pg_net exists
create extension if not exists pg_net with schema extensions;

-- 1) Lightweight debug table (no RLS) so errors don't hide
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

-- 2) Helper to detect admin-origin messages (supports multiple schemas)
create or replace function public._is_admin_message(rec anyelement)
returns boolean
language plpgsql stable
as $$
declare jb jsonb := to_jsonb(rec);
begin
  if (jb ? 'is_admin') and (jb->>'is_admin')::boolean then return true; end if;
  if (jb ? 'sender_role') and (jb->>'sender_role') = 'admin' then return true; end if;
  if (jb ? 'sender') and (jb->>'sender') = 'admin' then return true; end if;
  return false;
end;
$$;

-- 3) Safe "best-effort" notifier (short timeout + swallows errors)
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
  begin
    for resp in
      select * from extensions.net.http_post(
        url := v_url,
        headers := '{"Content-Type":"application/json"}',
        body := body::text,
        timeout_milliseconds := 1500   -- keep it short so chat never stalls
      )
    loop
      insert into public.pushcut_debug_log(stage, thread_id, message_id, info, http_status, error)
      values ('http', p_thread_id, p_message_id, body, resp.status, nullif(resp.error,''));
    end loop;
  exception when others then
    -- NEVER fail the chat insert because of push
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, error)
    values ('http:exception', p_thread_id, p_message_id, body, sqlerrm);
  end;
end;
$$;

revoke all on function public.pushcut_notify_support_direct(uuid,uuid,text,text,text) from public;
grant execute on function public.pushcut_notify_support_direct(uuid,uuid,text,text,text) to authenticated;

-- 4) Replace the trigger with a fail-safe version (always returns NEW)
create or replace function public.trg_support_messages_pushcut()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  jb jsonb := to_jsonb(NEW);
  v_message text := coalesce(jb->>'message', jb->>'content', '');
  v_thread uuid := (jb->>'thread_id')::uuid;
  v_title text; v_text text; v_open text;
  v_name  text; v_phone text;
  v_service text; v_comm text;
begin
  -- Log that we fired
  insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
  values ('trigger:fired', v_thread, (jb->>'id')::uuid, jb);

  -- Only when USER sends
  if public._is_admin_message(NEW) then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info)
    values ('trigger:skip:admin_msg', v_thread, (jb->>'id')::uuid, jsonb_build_object('reason','admin origin'));
    return NEW;
  end if;

  -- Everything below is best-effort; never fail the insert
  begin
    v_message := left(regexp_replace(coalesce(v_message,''), E'[\\n\\r]+', ' ', 'g'), 140);

    -- user profile
    select p.full_name, p.phone
      into v_name, v_phone
      from support_threads t join profiles p on p.id = t.user_id
     where t.id = v_thread;

    -- optional booking context
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
    -- Use full path if you prefer: 'https://admin.yourdomain.com/admin/chat/'||v_thread
    v_open := '/admin/chat/' || v_thread::text;

    perform public.pushcut_notify_support_direct(v_thread, (jb->>'id')::uuid, v_title, v_text, v_open);
  exception when others then
    insert into public.pushcut_debug_log(stage, thread_id, message_id, error, info)
    values ('trigger:exception', v_thread, (jb->>'id')::uuid, sqlerrm, jb);
  end;

  return NEW; -- ALWAYS let the message insert succeed
end;
$$;

drop trigger if exists support_messages_pushcut on public.support_messages;
create trigger support_messages_pushcut
after insert on public.support_messages
for each row execute procedure public.trg_support_messages_pushcut();