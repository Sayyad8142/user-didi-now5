-- Update Pushcut webhook URL to the new notification endpoint
insert into public.ops_settings (key, value) values
  ('pushcut_booking_url','https://api.pushcut.io/D6ysiDzEXvc72A67VpmkU/notifications/Maid%20app%20booking')
on conflict (key) do update set value = excluded.value;