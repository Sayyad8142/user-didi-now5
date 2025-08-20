-- Create feedback table for support and user feedback
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('booking','payment','bug','suggestion','other')),
  rating int CHECK (rating BETWEEN 1 AND 5),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS feedback_user_idx ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback(created_at DESC);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users: insert their own feedback
DROP POLICY IF EXISTS feedback_insert_self ON public.feedback;
CREATE POLICY feedback_insert_self ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users: read their own feedback
DROP POLICY IF EXISTS feedback_select_self ON public.feedback;
CREATE POLICY feedback_select_self ON public.feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins: read all feedback
DROP POLICY IF EXISTS feedback_admin_select ON public.feedback;
CREATE POLICY feedback_admin_select ON public.feedback
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Admins: delete feedback (optional)
DROP POLICY IF EXISTS feedback_admin_delete ON public.feedback;
CREATE POLICY feedback_admin_delete ON public.feedback
  FOR DELETE TO authenticated
  USING (public.is_admin());