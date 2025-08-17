-- Enable HTTP extension (required to call webhooks)
create extension if not exists http;

-- Store your Pushcut webhook URL and the admin page to open (edit values)
-- Replace <YOUR-PUSHCUT-WEBHOOK-URL> with the exact URL from Pushcut
-- Optional: admin_open_url is where the notification should deep-link (e.g., your PWA admin route)
insert into public.ops_settings(key,value) values
  ('pushcut_booking_url','<YOUR-PUSHCUT-WEBHOOK-URL>'),
  ('admin_open_url','https://your-domain.com/admin')
on conflict (key) do update set value=excluded.value;

-- Function to send the Pushcut notification for new bookings
create or replace function public.notify_pushcut_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text := (select value from public.ops_settings where key='pushcut_booking_url');
  v_open text := (select value from public.ops_settings where key='admin_open_url');
  v_title text;
  v_body  text;
  v_resp  http_response;
begin
  -- Only fire for brand-new pending bookings
  if v_url is null or v_url = '' then
    return new;
  end if;

  if new.status = 'pending' then
    -- Example payload; adjust keys to match your Pushcut "Incoming Webhook"/Automation
    v_title := 'New Booking — ' || coalesce(initcap(new.service_type),'Service');
    v_body  := coalesce(new.community,'')||' '||coalesce(new.flat_no,'')
               || ' • ' || coalesce(new.cust_name,'') || ' ('||coalesce(new.cust_phone,'')||')';

    -- Many Pushcut automations accept JSON with title/text/url & sound.
    -- If your automation uses different fields, tweak the keys below.
    v_resp := http_post(
      v_url,
      json_build_object(
        'title', v_title,
        'text',  v_body,
        'url',   coalesce(v_open,'') || case when v_open is null or v_open='' then '' else '?b='||new.id end,
        'sound', 'siren',        -- use the sound you configured in Pushcut
        'priority', 'high'       -- optional
      )::text,
      'application/json'
    );
  end if;

  return new;
end
$$;

-- Trigger: run on every insert into bookings
drop trigger if exists trg_notify_pushcut_new_booking on public.bookings;
create trigger trg_notify_pushcut_new_booking
after insert on public.bookings
for each row execute function public.notify_pushcut_new_booking();