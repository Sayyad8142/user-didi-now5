
SELECT cron.schedule(
  'auto-cancel-stale-instant-bookings',
  '*/5 * * * *',
  'SELECT public.auto_cancel_stale_instant_bookings()'
);
