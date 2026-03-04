
-- Reschedule cron jobs to reduce Disk IO
-- Unschedule by jobid, then re-create with new schedule

-- 1) dispatch-pending-bookings-cron: every 1 min → every 2 min
SELECT cron.unschedule(15);
SELECT cron.schedule(
  'dispatch-pending-bookings-cron',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/dispatch-pending-bookings',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 2) send-scheduled-booking-alerts: every 1 min → every 3 min
SELECT cron.unschedule(4);
SELECT cron.schedule(
  'send-scheduled-booking-alerts',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/check-scheduled-bookings',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"}'::jsonb
  ) AS request_id;
  $$
);

-- 3) sweep_preferred_timeouts: every 1 min → every 3 min
SELECT cron.unschedule(14);
SELECT cron.schedule(
  'sweep_preferred_timeouts',
  '*/3 * * * *',
  $$SELECT public.sweep_preferred_timeouts();$$
);

-- 4) timeout-expired-booking-requests: every 1 min → every 3 min
SELECT cron.unschedule(12);
SELECT cron.schedule(
  'timeout-expired-booking-requests',
  '*/3 * * * *',
  $$SELECT public.timeout_expired_booking_requests();$$
);
