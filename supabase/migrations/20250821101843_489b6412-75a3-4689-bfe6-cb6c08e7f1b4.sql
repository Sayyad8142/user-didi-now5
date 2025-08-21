-- Ensure admin phone configured for DB-side is_admin() checks
insert into public.ops_settings (key, value)
values ('admin_phone', '+919000666986')
on conflict (key) do nothing;

insert into public.ops_settings (key, value)
values ('admin_whitelist', '+919000666986')
on conflict (key) do nothing;