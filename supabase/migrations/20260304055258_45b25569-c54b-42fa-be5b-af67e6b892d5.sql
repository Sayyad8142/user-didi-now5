
-- Schedule daily cleanup of worker_presence_snapshots at 03:30 IST (22:00 UTC)
SELECT cron.schedule(
  'cleanup-presence-snapshots-daily',
  '0 22 * * *',
  'SELECT public.cleanup_old_presence_snapshots()'
);
