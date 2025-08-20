-- Add consent tracking columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_version text;

-- Set the current legal version (can be updated later to prompt re-consent)
INSERT INTO public.ops_settings(key, value)
VALUES ('current_legal_version', '2025-08-19')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;