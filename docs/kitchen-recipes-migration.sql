-- =====================================================================
-- Didi Kitchen — Phase 1 schema for the EXTERNAL Supabase project
-- Run this in the external Supabase SQL editor (api.didisnow.com).
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT.
-- =====================================================================

-- Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.recipe_difficulty AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recipe_diet AS ENUM ('veg', 'non_veg', 'egg');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  image_url         TEXT NOT NULL,
  cooking_time_min  INTEGER NOT NULL DEFAULT 20 CHECK (cooking_time_min > 0),
  difficulty        public.recipe_difficulty NOT NULL DEFAULT 'easy',
  diet              public.recipe_diet NOT NULL DEFAULT 'veg',
  categories        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  calories          INTEGER,
  serves            INTEGER DEFAULT 2,
  -- Reserved for Phase 2 (recipe detail, ingredient scaling, cooking steps):
  ingredients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps             JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_active_name
  ON public.recipes (is_active, name);
CREATE INDEX IF NOT EXISTS idx_recipes_categories_gin
  ON public.recipes USING GIN (categories);

-- Grants (PostgREST) -------------------------------------------------
GRANT SELECT ON public.recipes TO anon, authenticated;
GRANT ALL    ON public.recipes TO service_role;

-- RLS ----------------------------------------------------------------
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_public_read" ON public.recipes;
CREATE POLICY "recipes_public_read"
  ON public.recipes
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admin CRUD happens via service_role from the separate admin app,
-- which bypasses RLS. No INSERT/UPDATE/DELETE policies for end users.

-- updated_at trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_recipes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recipes_touch_updated_at ON public.recipes;
CREATE TRIGGER trg_recipes_touch_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.tg_recipes_touch_updated_at();

-- Seed data ----------------------------------------------------------
INSERT INTO public.recipes (slug, name, image_url, cooking_time_min, difficulty, diet, categories, calories, serves)
VALUES
  ('upma',                 'Upma',                 '/__l5e/assets-v1/2f6223f4-baaf-4295-9761-698b5386d5e1/upma.jpg',                 20, 'easy',   'veg',     ARRAY['breakfast','quick'],           280, 2),
  ('masala-dosa',          'Masala Dosa',          '/__l5e/assets-v1/11bc31fc-d359-40fc-8ee0-daa63b47b2fd/dosa.jpg',                 35, 'medium', 'veg',     ARRAY['breakfast','dinner'],          420, 2),
  ('poha',                 'Poha',                 '/__l5e/assets-v1/16da0e18-c6d3-45b1-9cb1-4f2ed305b8ca/poha.jpg',                 15, 'easy',   'veg',     ARRAY['breakfast','quick','healthy'], 250, 2),
  ('idli',                 'Idli',                 '/__l5e/assets-v1/e107bb9f-70e6-46b0-855f-bb1d0c354b33/idli.jpg',                 25, 'easy',   'veg',     ARRAY['breakfast','healthy','kids'],  210, 3),
  ('tomato-rice',          'Tomato Rice',          '/__l5e/assets-v1/1e292c44-56c1-426d-983d-3e3a95333462/tomato-rice.jpg',          30, 'easy',   'veg',     ARRAY['lunch','dinner'],              380, 3),
  ('paneer-butter-masala', 'Paneer Butter Masala', '/__l5e/assets-v1/8541b876-2bb2-4364-8541-14b8ab369b89/paneer-butter-masala.jpg', 40, 'medium', 'veg',     ARRAY['lunch','dinner'],              520, 3),
  ('dal-tadka',            'Dal Tadka',            '/__l5e/assets-v1/3132383f-8e1d-4814-b745-0ceadeeebb9e/dal-tadka.jpg',            30, 'easy',   'veg',     ARRAY['lunch','dinner','healthy'],    220, 3),
  ('chicken-curry',        'Chicken Curry',        '/__l5e/assets-v1/c4621ada-dfa6-4912-aba4-f7a1c803cd32/chicken-curry.jpg',        45, 'medium', 'non_veg', ARRAY['lunch','dinner'],              480, 3),
  ('egg-curry',            'Egg Curry',            '/__l5e/assets-v1/c7a1a17e-0b62-48f6-b3fa-50f95410d4b2/egg-curry.jpg',            30, 'easy',   'egg',     ARRAY['lunch','dinner'],              320, 3),
  ('jeera-rice',           'Jeera Rice',           '/__l5e/assets-v1/0d79bd76-8315-446e-a4e0-1968acbf3353/jeera-rice.jpg',           20, 'easy',   'veg',     ARRAY['lunch','dinner','quick'],      300, 3),
  ('veg-pulao',            'Veg Pulao',            '/__l5e/assets-v1/2cda4b4e-3e18-4091-8b60-5a648fc7600e/veg-pulao.jpg',            35, 'medium', 'veg',     ARRAY['lunch','dinner'],              400, 4),
  ('fried-rice',           'Veg Fried Rice',       '/__l5e/assets-v1/b10d8cd2-5d7f-40ae-abc5-7b2bae681c8c/fried-rice.jpg',           20, 'easy',   'veg',     ARRAY['lunch','dinner','kids','quick'], 360, 3)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  image_url        = EXCLUDED.image_url,
  cooking_time_min = EXCLUDED.cooking_time_min,
  difficulty       = EXCLUDED.difficulty,
  diet             = EXCLUDED.diet,
  categories       = EXCLUDED.categories,
  calories         = EXCLUDED.calories,
  serves           = EXCLUDED.serves,
  updated_at       = now();

-- =====================================================================
-- Admin CRUD is performed by the separate admin app using service_role.
-- No further changes required to app_config or edge functions.
-- =====================================================================
