-- Fix admin_phones to have consistent normalized format (digits only, with 91 prefix)
UPDATE public.ops_settings 
SET value = '919000666986,916281663218'
WHERE key = 'admin_phones';