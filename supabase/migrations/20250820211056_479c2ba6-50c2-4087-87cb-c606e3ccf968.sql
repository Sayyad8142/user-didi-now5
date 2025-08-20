-- Add web_version setting for live updates
INSERT INTO public.ops_settings (key, value) 
VALUES ('web_version', '1.0.0')
ON CONFLICT (key) DO NOTHING;