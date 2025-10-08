-- Add new admin phone number to the CSV list in ops_settings
-- First check if admin_phones key exists, if not create it
INSERT INTO public.ops_settings (key, value)
VALUES ('admin_phones', '+919000666986,+916281663218')
ON CONFLICT (key) 
DO UPDATE SET 
  value = CASE 
    WHEN public.ops_settings.value LIKE '%6281663218%' THEN public.ops_settings.value
    ELSE public.ops_settings.value || ',+916281663218'
  END;