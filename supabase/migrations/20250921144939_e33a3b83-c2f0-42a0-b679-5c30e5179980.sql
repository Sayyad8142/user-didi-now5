-- Fix notification_queue table to allow NULL target_user_id for system notifications
-- The trigger function tries to insert NULL for target_user_id but the column has NOT NULL constraint

ALTER TABLE public.notification_queue 
ALTER COLUMN target_user_id DROP NOT NULL;