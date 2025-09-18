-- Fix the Pushcut function to use the correct HTTP approach
create or replace function public.pushcut_notify_support_direct(
  p_thread_id uuid,
  p_message_id uuid,
  p_title text,
  p_text  text,
  p_open_url text
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url text := 'https://api.pushcut.io/D6ysiDzEXvc72A67VpmkU/notifications/Maid%20app%20booking';
  resp public.http_response;
  body jsonb := jsonb_build_object(
    'title',   coalesce(p_title,'New Support Message'),
    'text',    coalesce(p_text,''),
    'openUrl', p_open_url,              -- deep link to admin chat
    'priority','high',                  -- request prominent alert
    'sound',   'alert'                  -- request sound
  );
begin
  begin
    -- Use the public.http_post function instead of extensions.net.http_post
    resp := public.http_post(
      v_url,
      body::text,
      'application/json'
    );
    
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, http_status, error)
    values ('http', p_thread_id, p_message_id, body, resp.status, nullif(resp.error,''));
    
  exception when others then
    -- Never break chat; just log failure
    insert into public.pushcut_debug_log(stage, thread_id, message_id, info, error)
    values ('http:exception', p_thread_id, p_message_id, body, sqlerrm);
  end;
end; $$;