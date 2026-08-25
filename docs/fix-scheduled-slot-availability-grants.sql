-- ============================================================================
-- Fix: get_scheduled_slot_availability is not executable by app clients
-- Symptom (LIVE, verified 2026-08-25):
--   POST /rest/v1/rpc/get_scheduled_slot_availability
--   -> 401 {"code":"42501","message":"permission denied for function
--            get_scheduled_slot_availability"}
-- Effect: the User App loses the authoritative slot allowlist and degrades to
--         the "availability unknown" fallback.
-- Run on the EXTERNAL Supabase project (api.didisnow.com).
-- ============================================================================

-- The function is SECURITY DEFINER, so EXECUTE is safe: it only returns
-- slot_time + worker_count aggregates, never worker PII.
GRANT EXECUTE ON FUNCTION public.get_scheduled_slot_availability(text, text, date) TO anon;
GRANT EXECUTE ON FUNCTION public.get_scheduled_slot_availability(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_slot_availability(text, text, date) TO service_role;

-- If the signature differs in production, discover it first:
--   SELECT p.oid::regprocedure AS signature
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'get_scheduled_slot_availability';
-- then GRANT on the exact signature printed above.

NOTIFY pgrst, 'reload schema';

-- Verification (expect rows, not 42501):
-- SELECT * FROM public.get_scheduled_slot_availability('prestige-high-fields','maid', CURRENT_DATE);
-- SELECT has_function_privilege('anon',
--   'public.get_scheduled_slot_availability(text,text,date)', 'EXECUTE') AS anon_can_execute;
