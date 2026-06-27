DROP POLICY IF EXISTS "Anyone can insert favorite worker events" ON public.favorite_worker_events;
REVOKE INSERT ON public.favorite_worker_events FROM authenticated, anon;