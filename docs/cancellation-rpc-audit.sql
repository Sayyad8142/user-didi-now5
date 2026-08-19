-- Check the definition of user_cancel_booking and related functions
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
AND p.proname IN ('user_cancel_booking', 'cancel_unassigned_booking', 'process_booking_refund');
