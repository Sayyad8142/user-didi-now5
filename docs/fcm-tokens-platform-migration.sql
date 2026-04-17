-- ============================================================================
-- fcm_tokens: add `platform` column for iOS/Android/web observability
-- Run on PRODUCTION Supabase project (paywwbuqycovjopryele).
-- Safe to run multiple times.
-- ============================================================================

-- 1. Add the column if it doesn't exist.
ALTER TABLE public.fcm_tokens
  ADD COLUMN IF NOT EXISTS platform TEXT;

-- 2. (Optional) Constrain to known values. Leave NULL allowed for legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fcm_tokens_platform_chk'
  ) THEN
    ALTER TABLE public.fcm_tokens
      ADD CONSTRAINT fcm_tokens_platform_chk
      CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web', 'unknown'));
  END IF;
END $$;

-- 3. Index for fast per-platform diagnostics queries.
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_platform
  ON public.fcm_tokens (platform);

-- 4. Backfill best-effort guess from device_info / user_agent if those columns exist.
--    Adjust column names to match your schema; this block is a no-op if columns are absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fcm_tokens' AND column_name = 'device_info'
  ) THEN
    EXECUTE $sql$
      UPDATE public.fcm_tokens
      SET platform = CASE
        WHEN platform IS NOT NULL THEN platform
        WHEN device_info::text ILIKE '%"platform":"ios"%' THEN 'ios'
        WHEN device_info::text ILIKE '%"platform":"android"%' THEN 'android'
        WHEN device_info::text ILIKE '%"platform":"web"%' THEN 'web'
        ELSE NULL
      END
      WHERE platform IS NULL;
    $sql$;
  END IF;
END $$;

-- 5. Sanity check.
SELECT platform, COUNT(*) AS token_count
FROM public.fcm_tokens
GROUP BY platform
ORDER BY token_count DESC;
