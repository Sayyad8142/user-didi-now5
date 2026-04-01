-- ============================================================================
-- Cron job: cleanup-unpaid-bookings
-- Runs every 5 minutes to cancel orphan Pay Now bookings
-- 
-- IMPORTANT: Run this in the PRODUCTION Supabase SQL Editor
-- Replace PROJECT_URL and ANON_KEY with production values
-- ============================================================================

-- 1. Index for efficient orphan booking lookup
CREATE INDEX IF NOT EXISTS idx_unpaid_bookings_cleanup
ON bookings (payment_status, created_at)
WHERE payment_status = 'pending';

-- 2. Cron job to invoke the edge function every 5 minutes
SELECT cron.schedule(
  'cleanup-unpaid-bookings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/cleanup-unpaid-bookings',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
