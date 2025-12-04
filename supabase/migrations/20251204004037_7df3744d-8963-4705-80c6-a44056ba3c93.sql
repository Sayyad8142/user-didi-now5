-- Unschedule the old broken SQL cron job
SELECT cron.unschedule('didinow_prealerts_every_minute');

-- Reset prealert_sent for the booking that was marked without actual notification
UPDATE bookings 
SET prealert_sent = false, updated_at = now()
WHERE id = 'cd3d6d3b-1412-4230-bf8a-88e1e6a45421'
  AND booking_type = 'scheduled' 
  AND status = 'pending';