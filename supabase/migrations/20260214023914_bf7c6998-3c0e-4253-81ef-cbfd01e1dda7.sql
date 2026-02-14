
-- Team astrological reference table
CREATE TABLE public.team_astro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_abbr TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT 'NBA',
  -- Founding chart
  founded_date TEXT, -- YYYY-MM-DD
  founded_city TEXT,
  founded_lat NUMERIC,
  founded_lng NUMERIC,
  -- Relocation (current city if different)
  relocated_date TEXT,
  relocated_city TEXT,
  relocated_lat NUMERIC,
  relocated_lng NUMERIC,
  -- Zodiac associations
  mascot_sign TEXT, -- e.g., Taurus for Bulls
  city_ruler TEXT, -- planetary ruler of city
  element TEXT, -- Fire/Earth/Air/Water
  modality TEXT, -- Cardinal/Fixed/Mutable
  ruling_planet TEXT, -- traditional ruler
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS needed - public reference data
ALTER TABLE public.team_astro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team astro data is publicly readable" ON public.team_astro FOR SELECT USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_team_astro_updated_at
  BEFORE UPDATE ON public.team_astro
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
