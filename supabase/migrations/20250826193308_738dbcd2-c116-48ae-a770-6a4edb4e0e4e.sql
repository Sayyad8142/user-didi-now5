insert into public.ops_settings(key, value) values
  ('pricing_note','Note: this price is not fixed; it may go up or down based on the exact work.')
on conflict (key) do update set value = excluded.value;