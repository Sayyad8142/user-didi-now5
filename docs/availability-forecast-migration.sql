-- ============================================================================
-- Worker Availability Forecast
-- Run on EXTERNAL Supabase (api.didisnow.com) — Lovable AI cannot run DDL here.
--
-- Creates a per-(community, service_type, hour_of_day) rolling 30-day stat
-- powering the home-screen "Worker Availability Today" forecast.
--
-- Apply with:
--   psql "$EXTERNAL_DB_URL" -f docs/availability-forecast-migration.sql
-- ============================================================================

-- 1. Materialized view: rolling 30-day hourly fulfillment stats per society
DROP MATERIALIZED VIEW IF EXISTS public.community_hourly_availability CASCADE;

CREATE MATERIALIZED VIEW public.community_hourly_availability AS
WITH src AS (
  SELECT
    community,
    service_type,
    EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata'))::int AS hour_of_day,
    status,
    worker_id
  FROM public.bookings
  WHERE created_at >= now() - INTERVAL '30 days'
    AND community IS NOT NULL
    AND service_type IS NOT NULL
)
SELECT
  community,
  service_type,
  hour_of_day,
  COUNT(*)::int                                              AS total_bookings,
  COUNT(*) FILTER (
    WHERE worker_id IS NOT NULL
      AND status NOT IN ('cancelled','auto_cancelled','expired','no_worker_found')
  )::int                                                     AS fulfilled_bookings,
  COUNT(*) FILTER (
    WHERE status IN ('cancelled','auto_cancelled','expired','no_worker_found')
       OR worker_id IS NULL
  )::int                                                     AS failed_bookings,
  CASE
    WHEN COUNT(*) = 0 THEN NULL
    ELSE ROUND(
      COUNT(*) FILTER (
        WHERE worker_id IS NOT NULL
          AND status NOT IN ('cancelled','auto_cancelled','expired','no_worker_found')
      )::numeric / COUNT(*)::numeric,
      4
    )
  END                                                        AS fulfillment_rate,
  now()                                                      AS computed_at
FROM src
GROUP BY community, service_type, hour_of_day;

CREATE UNIQUE INDEX IF NOT EXISTS community_hourly_availability_pk
  ON public.community_hourly_availability (community, service_type, hour_of_day);

-- 2. Refresh helper (concurrent, safe to call from pg_cron)
CREATE OR REPLACE FUNCTION public.refresh_community_hourly_availability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.community_hourly_availability;
EXCEPTION WHEN OTHERS THEN
  -- First-time / non-concurrent fallback
  REFRESH MATERIALIZED VIEW public.community_hourly_availability;
END;
$$;

-- 3. Public RPC: returns 13 rows (hour 7..19) for a community + service,
--    filling missing hours with an optimistic default (0 demand → free).
CREATE OR REPLACE FUNCTION public.get_availability_forecast(
  p_community  text,
  p_service    text
)
RETURNS TABLE (
  hour_of_day        int,
  total_bookings     int,
  fulfilled_bookings int,
  failed_bookings    int,
  availability_pct   int,
  bucket             text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hours AS (
    SELECT generate_series(7, 19) AS h
  ),
  joined AS (
    SELECT
      h.h                                                  AS hour_of_day,
      COALESCE(v.total_bookings, 0)                        AS total_bookings,
      COALESCE(v.fulfilled_bookings, 0)                    AS fulfilled_bookings,
      COALESCE(v.failed_bookings, 0)                       AS failed_bookings,
      CASE
        WHEN v.total_bookings IS NULL OR v.total_bookings = 0 THEN 90
        ELSE GREATEST(0, LEAST(100,
          ROUND(COALESCE(v.fulfillment_rate, 0.85) * 100)::int
        ))
      END                                                  AS availability_pct
    FROM hours h
    LEFT JOIN public.community_hourly_availability v
      ON v.community    = p_community
     AND v.service_type = p_service
     AND v.hour_of_day  = h.h
  )
  SELECT
    hour_of_day,
    total_bookings,
    fulfilled_bookings,
    failed_bookings,
    availability_pct,
    CASE
      WHEN availability_pct >= 80 THEN 'very_high'
      WHEN availability_pct >= 60 THEN 'high'
      WHEN availability_pct >= 40 THEN 'medium'
      WHEN availability_pct >= 20 THEN 'low'
      ELSE 'very_low'
    END AS bucket
  FROM joined
  ORDER BY hour_of_day;
$$;

GRANT EXECUTE ON FUNCTION public.get_availability_forecast(text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_community_hourly_availability()
  TO service_role;
GRANT SELECT ON public.community_hourly_availability
  TO anon, authenticated, service_role;

-- 4. Initial populate
SELECT public.refresh_community_hourly_availability();

-- 5. Schedule hourly refresh via pg_cron (requires pg_cron extension)
--    Safe to re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-community-hourly-availability')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'refresh-community-hourly-availability'
    );
    PERFORM cron.schedule(
      'refresh-community-hourly-availability',
      '7 * * * *',
      $cron$ SELECT public.refresh_community_hourly_availability(); $cron$
    );
  END IF;
END $$;
