-- ============================================================
-- LOYALTY PRICING V1 — external production DB (paywwbuqycovjopryele)
-- ============================================================
-- Adds completed_bookings_count to profiles, auto-increments it
-- whenever a booking's status transitions to 'completed', and
-- backfills historical counts.
--
-- Run this once on the EXTERNAL production database.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- 1. Column on profiles (single source of truth)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS completed_bookings_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_completed_bookings_count
  ON public.profiles (completed_bookings_count);

-- 2. Trigger function — increments counter on completion (idempotent)
CREATE OR REPLACE FUNCTION public.increment_user_completed_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status transitions INTO 'completed' from any other state.
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
     AND NEW.user_id IS NOT NULL
  THEN
    UPDATE public.profiles
       SET completed_bookings_count = COALESCE(completed_bookings_count, 0) + 1
     WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger on bookings
DROP TRIGGER IF EXISTS trg_increment_user_completed_bookings ON public.bookings;
CREATE TRIGGER trg_increment_user_completed_bookings
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.increment_user_completed_bookings();

-- 4. Backfill historical counts (one-time)
UPDATE public.profiles p
   SET completed_bookings_count = sub.cnt
  FROM (
    SELECT user_id, COUNT(*)::int AS cnt
      FROM public.bookings
     WHERE status = 'completed' AND user_id IS NOT NULL
     GROUP BY user_id
  ) sub
 WHERE p.id = sub.user_id
   AND p.completed_bookings_count IS DISTINCT FROM sub.cnt;
