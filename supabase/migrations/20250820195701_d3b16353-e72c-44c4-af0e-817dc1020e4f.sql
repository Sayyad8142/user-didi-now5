-- Fix Security Definer View issue
-- Drop and recreate the worker_rating_stats view with proper security context

drop view if exists public.worker_rating_stats;

-- Recreate view with explicit SECURITY INVOKER to ensure it respects RLS policies
create view public.worker_rating_stats 
with (security_invoker=true) as
select
  worker_id,
  avg(rating)::numeric(3,2) as avg_rating,
  count(*)::int as ratings_count
from public.worker_ratings
group by worker_id;

-- Grant appropriate permissions
grant select on public.worker_rating_stats to authenticated;