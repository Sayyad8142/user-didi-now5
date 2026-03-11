
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS latest_version_name text NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS force_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS update_title text NOT NULL DEFAULT 'Update Available',
  ADD COLUMN IF NOT EXISTS soft_update_message text NOT NULL DEFAULT 'A new version of Didi Now is available with improvements and bug fixes.';
