-- Reset prealert_sent for the pending scheduled booking so cron can pick it up
UPDATE bookings 
SET prealert_sent = false 
WHERE id = '42122a97-7a19-4234-a75b-86683653002f' 
  AND status = 'pending' 
  AND booking_type = 'scheduled';