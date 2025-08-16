-- Add an admin flag and RLS so admins can read ALL bookings

-- 0.1 Add is_admin to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 0.2 Mark your admin (adjust the phone if needed)
UPDATE public.profiles
SET is_admin = true
WHERE phone IN ('+919000666986');

-- 0.3 Ensure RLS is enabled
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 0.4 Bookings policies (self + admin)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='bookings_select_self') THEN
    CREATE POLICY bookings_select_self ON public.bookings
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='bookings_insert_self') THEN
    CREATE POLICY bookings_insert_self ON public.bookings
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='bookings_select_admin') THEN
    CREATE POLICY bookings_select_admin ON public.bookings
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END$$;

-- 0.5 Profiles policies (self access already; add admin-read-all so admin can compute "Total Users")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_self') THEN
    CREATE POLICY profiles_select_self ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_admin') THEN
    CREATE POLICY profiles_select_admin ON public.profiles
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END$$;

-- 0.6 Optional indexes for speed
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_user_created ON public.bookings(user_id, created_at DESC);

-- Enable realtime for bookings table
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;