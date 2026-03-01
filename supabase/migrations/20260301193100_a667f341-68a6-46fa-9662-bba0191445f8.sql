
-- Dish intensity pricing per community
CREATE TABLE public.dish_intensity_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community text NOT NULL DEFAULT '',
  intensity text NOT NULL, -- 'light', 'medium', 'heavy'
  extra_inr integer NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(community, intensity)
);

ALTER TABLE public.dish_intensity_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dish_intensity_pricing_read" ON public.dish_intensity_pricing FOR SELECT USING (true);
CREATE POLICY "dish_intensity_pricing_admin_write" ON public.dish_intensity_pricing FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Seed global defaults
INSERT INTO public.dish_intensity_pricing (community, intensity, extra_inr, label, description) VALUES
  ('', 'light', 0, 'Light', '5-10 items'),
  ('', 'medium', 30, 'Medium', '10-20 items'),
  ('', 'heavy', 50, 'Heavy', '20+ items');
