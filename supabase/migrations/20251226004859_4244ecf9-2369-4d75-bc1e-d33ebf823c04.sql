-- 1️⃣ PROFILES TABLE

-- Enable RLS (already enabled, but ensure it is)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that use auth.uid()
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own_firebase" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_firebase" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own_firebase" ON profiles;
DROP POLICY IF EXISTS "public_check_phone_exists" ON profiles;

-- Create new public policies
DROP POLICY IF EXISTS "Public read profiles" ON profiles;
CREATE POLICY "Public read profiles"
ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert profiles" ON profiles;
CREATE POLICY "Public insert profiles"
ON profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update profiles" ON profiles;
CREATE POLICY "Public update profiles"
ON profiles FOR UPDATE USING (true) WITH CHECK (true);

-- Add firebase_uid uniqueness constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_firebase_uid_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_firebase_uid_key UNIQUE (firebase_uid);
  END IF;
END $$;

-- Add phone uniqueness constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_phone_key UNIQUE (phone);
  END IF;
END $$;

-- 2️⃣ BOOKINGS TABLE

-- Enable RLS (already enabled, but ensure it is)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Create public insert policy
DROP POLICY IF EXISTS "Public insert bookings" ON bookings;
CREATE POLICY "Public insert bookings"
ON bookings FOR INSERT WITH CHECK (true);

-- Create public read policy
DROP POLICY IF EXISTS "Public read bookings" ON bookings;
CREATE POLICY "Public read bookings"
ON bookings FOR SELECT USING (true);

-- 3️⃣ MASTER TABLES (communities, buildings, flats, services)

-- Communities
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read communities" ON communities;
CREATE POLICY "Public read communities"
ON communities FOR SELECT USING (true);

-- Buildings
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read buildings" ON buildings;
CREATE POLICY "Public read buildings"
ON buildings FOR SELECT USING (true);

-- Flats
ALTER TABLE flats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read flats" ON flats;
CREATE POLICY "Public read flats"
ON flats FOR SELECT USING (true);

-- Services
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read services" ON services;
CREATE POLICY "Public read services"
ON services FOR SELECT USING (true);