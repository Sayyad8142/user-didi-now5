-- Messages for a booking (text-only)
CREATE TABLE IF NOT EXISTS public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin')),
  sender_name TEXT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_messages_booking_time
  ON public.booking_messages (booking_id, created_at);

ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;

-- USERS: can read/write messages only for their own bookings
DROP POLICY IF EXISTS user_select_booking_messages ON public.booking_messages;
CREATE POLICY user_select_booking_messages
ON public.booking_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND b.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS user_insert_booking_messages ON public.booking_messages;
CREATE POLICY user_insert_booking_messages
ON public.booking_messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- must be the booking owner and sender_id must match
  sender_id = auth.uid()
  AND sender_role = 'user'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id AND b.user_id = auth.uid()
  )
);

-- ADMINS: full read + write
DROP POLICY IF EXISTS admin_all_booking_messages ON public.booking_messages;
CREATE POLICY admin_all_booking_messages
ON public.booking_messages
FOR ALL
TO authenticated
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_messages;