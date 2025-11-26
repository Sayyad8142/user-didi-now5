-- Create buildings table
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create flats table
CREATE TABLE IF NOT EXISTS public.flats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  flat_no TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add flat_format column to communities table
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS flat_format TEXT DEFAULT 'standard' CHECK (flat_format IN ('standard', 'phf_code'));

-- Add new columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id),
ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id),
ADD COLUMN IF NOT EXISTS flat_id UUID REFERENCES public.flats(id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_buildings_community ON public.buildings(community_id);
CREATE INDEX IF NOT EXISTS idx_flats_building ON public.flats(building_id);
CREATE INDEX IF NOT EXISTS idx_flats_community ON public.flats(community_id);
CREATE INDEX IF NOT EXISTS idx_profiles_community_id ON public.profiles(community_id);
CREATE INDEX IF NOT EXISTS idx_profiles_building_id ON public.profiles(building_id);
CREATE INDEX IF NOT EXISTS idx_profiles_flat_id ON public.profiles(flat_id);

-- Add updated_at trigger for buildings
CREATE TRIGGER set_buildings_updated_at
  BEFORE UPDATE ON public.buildings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Add updated_at trigger for flats
CREATE TRIGGER set_flats_updated_at
  BEFORE UPDATE ON public.flats
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS on buildings
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

-- Enable RLS on flats
ALTER TABLE public.flats ENABLE ROW LEVEL SECURITY;

-- RLS policies for buildings (readable by all authenticated users)
CREATE POLICY "Buildings are viewable by authenticated users"
  ON public.buildings FOR SELECT
  TO authenticated
  USING (true);

-- RLS policies for buildings (admins can insert/update/delete)
CREATE POLICY "Admins can manage buildings"
  ON public.buildings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- RLS policies for flats (readable by all authenticated users)
CREATE POLICY "Flats are viewable by authenticated users"
  ON public.flats FOR SELECT
  TO authenticated
  USING (true);

-- RLS policies for flats (admins can insert/update/delete)
CREATE POLICY "Admins can manage flats"
  ON public.flats FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());