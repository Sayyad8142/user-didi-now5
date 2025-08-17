create or replace function public.notify_pushcut_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text := (select value from public.ops_settings where key='pushcut_booking_url');
  v_open text := (select value from public.ops_settings where key='admin_open_url');
  v_payload jsonb;
  v_resp  http_response;
begin
  -- no webhook configured → skip
  if v_url is null or v_url = '' then
    return new;
  end if;

  -- only alert on brand-new pending bookings
  if new.status <> 'pending' then
    return new;
  end if;

  -- build payload WITHOUT a "sound" key so Pushcut uses its own configured sound
  v_payload := jsonb_build_object(
    'title', 'New Booking — ' || coalesce(initcap(new.service_type),'Service'),
    'text',  coalesce(new.community,'') || ' ' || coalesce(new.flat_no,'') ||
             ' • ' || coalesce(new.cust_name,'') || ' (' || coalesce(new.cust_phone,'') || ')'
  );

  if v_open is not null and v_open <> '' then
    v_payload := v_payload || jsonb_build_object('url', v_open || '?b=' || new.id);
  end if;

  v_resp := http_post(v_url, v_payload::text, 'application/json');
  return new;
end
$$;