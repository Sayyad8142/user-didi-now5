-- =====================================================================
-- booking_issues — "Report an Issue" feature for active bookings
-- Run this on the EXTERNAL Supabase (api.didisnow.com) DB.
-- =====================================================================

-- 1) Table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,            -- profiles.id (NOT auth.uid)
  worker_id uuid NULL,              -- workers.id (nullable: not yet assigned)
  issue_type text NOT NULL,
  issue_description text NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_issues_issue_type_check CHECK (
    issue_type IN (
      'assigned_worker_not_came',
      'different_person_came',
      'worker_unreachable',
      'worker_asked_extra_money',
      'other'
    )
  ),
  CONSTRAINT booking_issues_status_check CHECK (
    status IN ('open', 'resolved', 'rejected')
  ),
  CONSTRAINT booking_issues_description_len CHECK (
    issue_description IS NULL OR char_length(issue_description) <= 200
  )
);

-- One complaint per booking (anti-spam)
CREATE UNIQUE INDEX IF NOT EXISTS booking_issues_booking_id_uniq
  ON public.booking_issues(booking_id);

CREATE INDEX IF NOT EXISTS booking_issues_user_id_idx
  ON public.booking_issues(user_id);

CREATE INDEX IF NOT EXISTS booking_issues_worker_id_idx
  ON public.booking_issues(worker_id);

CREATE INDEX IF NOT EXISTS booking_issues_status_idx
  ON public.booking_issues(status);

-- updated_at trigger (uses existing helper if present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_booking_issues_updated_at ON public.booking_issues;
CREATE TRIGGER update_booking_issues_updated_at
BEFORE UPDATE ON public.booking_issues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RLS --------------------------------------------------------------
ALTER TABLE public.booking_issues ENABLE ROW LEVEL SECURITY;

-- Service role (admin panel + edge functions): full access
DROP POLICY IF EXISTS "Service role full access on booking_issues" ON public.booking_issues;
CREATE POLICY "Service role full access on booking_issues"
ON public.booking_issues
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can read their own complaints (Firebase UID -> profiles.id mapping)
DROP POLICY IF EXISTS "Users can read their own booking issues" ON public.booking_issues;
CREATE POLICY "Users can read their own booking issues"
ON public.booking_issues
AS PERMISSIVE
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = booking_issues.user_id
      AND p.firebase_uid = COALESCE(
        current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
        ''
      )
  )
);

-- Users can insert complaints for their own bookings only
DROP POLICY IF EXISTS "Users can create issues for their own bookings" ON public.booking_issues;
CREATE POLICY "Users can create issues for their own bookings"
ON public.booking_issues
AS PERMISSIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.profiles p ON p.id = b.user_id
    WHERE b.id = booking_issues.booking_id
      AND b.user_id = booking_issues.user_id
      AND p.firebase_uid = COALESCE(
        current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
        ''
      )
  )
);

-- 3) Realtime ---------------------------------------------------------
ALTER TABLE public.booking_issues REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'booking_issues'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_issues';
  END IF;
END $$;

-- 4) Optional: Telegram alert on new complaint (admins) ---------------
-- Uncomment if you want immediate Telegram pings via pg_net (async, non-blocking).
--
-- CREATE OR REPLACE FUNCTION public.notify_admin_booking_issue()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   PERFORM net.http_post(
--     url := 'https://api.didisnow.com/functions/v1/send-telegram-alert',
--     headers := jsonb_build_object('Content-Type','application/json'),
--     body := jsonb_build_object(
--       'title', '⚠️ New booking complaint',
--       'message', 'Booking ' || NEW.booking_id || ' — type: ' || NEW.issue_type ||
--                  CASE WHEN NEW.issue_description IS NOT NULL
--                       THEN E'\nNote: ' || NEW.issue_description
--                       ELSE '' END
--     )
--   );
--   RETURN NEW;
-- EXCEPTION WHEN OTHERS THEN
--   RAISE WARNING 'Telegram alert failed: %', SQLERRM;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_notify_admin_booking_issue ON public.booking_issues;
-- CREATE TRIGGER trg_notify_admin_booking_issue
-- AFTER INSERT ON public.booking_issues
-- FOR EACH ROW EXECUTE FUNCTION public.notify_admin_booking_issue();
