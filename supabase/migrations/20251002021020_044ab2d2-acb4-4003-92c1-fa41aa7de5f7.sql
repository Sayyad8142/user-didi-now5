-- Add bookings_enabled flag to ops_settings
INSERT INTO ops_settings (key, value, updated_at)
VALUES ('bookings_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;

-- Add holiday_message to ops_settings
INSERT INTO ops_settings (key, value, updated_at)
VALUES ('holiday_message', 'We are closed today for Gandhi Jayanti (public holiday). Services will resume soon. Thank you for your understanding.', now())
ON CONFLICT (key) DO NOTHING;