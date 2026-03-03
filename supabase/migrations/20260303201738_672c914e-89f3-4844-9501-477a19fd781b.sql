INSERT INTO ops_settings (key, value) VALUES
  ('maintenance_mode', 'off'),
  ('maintenance_title', 'Under Maintenance'),
  ('maintenance_message', 'We are performing scheduled maintenance. We will be back shortly.'),
  ('maintenance_cta_label', 'Retry'),
  ('maintenance_allowlist_phones', '')
ON CONFLICT (key) DO NOTHING;