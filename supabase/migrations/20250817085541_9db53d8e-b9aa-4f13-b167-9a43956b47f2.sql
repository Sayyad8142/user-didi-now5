-- Settings store (admin-only via RLS)
create table if not exists public.ops_settings (
  key   text primary key,
  value text not null
);

alter table public.ops_settings enable row level security;

drop policy if exists ops_admin_all on public.ops_settings;
create policy ops_admin_all on public.ops_settings
for all using (public.is_admin()) with check (public.is_admin());

-- Save your Pushcut webhook URL (provided)
insert into public.ops_settings (key, value) values
  ('pushcut_booking_url','https://api.pushcut.io/D6ysiDzEXvc72A67VpmkU/notifications/MyNotification')
on conflict (key) do update set value = excluded.value;