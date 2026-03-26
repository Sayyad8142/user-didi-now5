
-- Single-row app config for version gating & maintenance
CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Version control (user app)
  latest_version_name text NOT NULL DEFAULT '1.0.0',
  min_user_version_name text NOT NULL DEFAULT '1.0.0',
  min_user_version_code integer NOT NULL DEFAULT 1,
  force_update boolean NOT NULL DEFAULT false,
  soft_update_enabled boolean NOT NULL DEFAULT false,
  update_title text NOT NULL DEFAULT 'Update Available',
  user_update_message text NOT NULL DEFAULT 'A new version is available. Please update to continue.',
  soft_update_message text NOT NULL DEFAULT 'A new version is available with improvements and bug fixes.',
  release_notes text DEFAULT '',
  play_store_url_user text DEFAULT '',
  ios_store_url text DEFAULT '',
  
  -- Maintenance
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_title text NOT NULL DEFAULT 'Under Maintenance',
  maintenance_message text NOT NULL DEFAULT 'We are performing scheduled maintenance. Please try again later.',
  maintenance_cta_label text NOT NULL DEFAULT 'Retry',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.app_config (id) VALUES (gen_random_uuid());

-- Allow all users to read config (no auth required)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config"
  ON public.app_config
  FOR SELECT
  TO anon, authenticated
  USING (true);
