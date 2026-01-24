-- Add user_reminder_sent column for tracking booking reminder notifications
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS user_reminder_sent boolean DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.bookings.user_reminder_sent IS 'Whether the user has been sent a reminder notification 30 mins before their scheduled booking';