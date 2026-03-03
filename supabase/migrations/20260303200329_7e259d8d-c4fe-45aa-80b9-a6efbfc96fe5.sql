ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS min_user_version_code integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_user_version_name text NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS user_update_message text NOT NULL DEFAULT 'A newer version of Didi Now is available. Please update to continue.',
  ADD COLUMN IF NOT EXISTS play_store_url_user text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.didisnow.app';