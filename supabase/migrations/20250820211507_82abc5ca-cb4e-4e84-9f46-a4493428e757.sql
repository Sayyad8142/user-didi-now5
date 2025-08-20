-- Add web_update_mode setting for critical updates
INSERT INTO public.ops_settings (key, value) 
VALUES ('web_update_mode', 'soft')
ON CONFLICT (key) DO NOTHING;