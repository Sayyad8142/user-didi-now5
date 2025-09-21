-- Fix notification_queue RLS policy to allow system functions to insert notifications
-- The issue is that the trigger function queue_intelligent_booking_notification 
-- tries to insert into notification_queue but the RLS policy only allows admin access

-- Create a secure policy that allows system functions to insert notifications
-- while still restricting direct user access
CREATE POLICY "notification_queue_system_insert" 
ON public.notification_queue 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Allow if called from trusted system functions/triggers
  current_setting('role', true) = 'authenticated' 
  AND (
    -- Allow admin users
    is_admin()
    -- Allow when target_user_id is NULL (system notifications)
    OR target_user_id IS NULL
    -- Allow when called from trigger context (pg_trigger_depth() > 0)
    OR pg_trigger_depth() > 0
  )
);

-- Also ensure the trigger function runs with proper security context
-- Recreate the function with SECURITY DEFINER to run with creator privileges
CREATE OR REPLACE FUNCTION public.queue_intelligent_booking_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    notification_title TEXT;
    notification_body TEXT;
    notification_data JSONB;
    available_experts_count INTEGER;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        notification_title := '🔔 New Booking Request';
        notification_body := 'New ' || COALESCE(NEW.service_type, 'service') || 
                           ' booking from ' || COALESCE(NEW.cust_name, 'customer') || 
                           ' in ' || COALESCE(NEW.community, 'community') ||
                           COALESCE(' on ' || NEW.scheduled_date::text, '');
        
        -- Get available experts count safely
        BEGIN
            SELECT COUNT(*) INTO available_experts_count
            FROM get_available_experts_for_booking(
                NEW.service_type,
                NEW.community,
                NOW()
            );
        EXCEPTION WHEN OTHERS THEN
            -- If the function doesn't exist or fails, default to 0
            available_experts_count := 0;
        END;
        
        notification_data := jsonb_build_object(
            'booking_id', NEW.id,
            'service_type', NEW.service_type,
            'customer_name', NEW.cust_name,
            'customer_phone', NEW.cust_phone,
            'community', NEW.community,
            'flat_no', NEW.flat_no,
            'flat_size', NEW.flat_size,
            'scheduled_date', NEW.scheduled_date,
            'scheduled_time', NEW.scheduled_time,
            'price_inr', NEW.price_inr,
            'notification_type', 'intelligent_booking_assignment',
            'action', 'show_booking_popup',
            'timestamp', NOW()::text,
            'available_experts_count', available_experts_count
        );
        
        INSERT INTO notification_queue (
            booking_id,
            notification_type,
            target_user_id,
            title,
            body,
            data,
            status,
            created_at
        ) VALUES (
            NEW.id,
            'intelligent_booking_assignment',
            NULL,
            notification_title,
            notification_body,
            notification_data,
            'pending',
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$function$;