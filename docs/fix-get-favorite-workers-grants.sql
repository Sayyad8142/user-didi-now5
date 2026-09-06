-- ============================================================================
-- Fix: "Choose your favorite worker" screen is empty in the User App.
--
-- Root cause: public.get_favorite_workers() exists and returns correct data,
-- but EXECUTE is not granted to the app roles. A direct client call returns:
--   {"code":"42501","message":"permission denied for function get_favorite_workers"}
-- and the app rendered that error as an empty list.
--
-- The app now falls back to the list-favorite-workers edge-function proxy
-- (service role), so this grant is an optimisation, not a hard requirement.
-- Run once on the production DB (api.didisnow.com / paywwbuqycovjopryele).
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_favorite_workers(text, text, uuid) TO anon, authenticated;

-- Verify:
--   SELECT has_function_privilege('anon',
--     'public.get_favorite_workers(text, text, uuid)', 'EXECUTE');
