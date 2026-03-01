-- Cancel all stale pending bookings created before today (2026-03-01)
UPDATE bookings 
SET status = 'cancelled', 
    cancel_source = 'admin', 
    cancel_reason = 'Stale pending booking - admin cleanup', 
    cancelled_at = now(), 
    updated_at = now() 
WHERE status = 'pending' 
  AND created_at::date < '2026-03-01';
