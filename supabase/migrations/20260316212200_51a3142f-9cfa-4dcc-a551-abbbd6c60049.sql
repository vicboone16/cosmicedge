
-- Astra Operating Modes + Command Center tables
CREATE TABLE IF NOT EXISTS public.astra_operating_modes (
  mode_key text PRIMARY KEY,
  mode_name text NOT NULL,
  description text,
  icon_name text,
  color_accent text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.astra_operating_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read modes" ON public.astra_operating_modes FOR SELECT TO authenticated USING (true);

INSERT INTO public.astra_operating_modes (mode_key, mode_name, description, icon_name, color_accent, sort_order) VALUES
('sharp', 'Sharp', 'Quant-focused, reduced cosmic emphasis', 'TrendingUp', 'hsl(220,80%,60%)', 1),
('cosmic', 'Cosmic', 'Balanced intelligence blend', 'Sparkles', 'hsl(270,80%,65%)', 2),
('sniper', 'Sniper', 'Live opportunities and hidden value', 'Crosshair', 'hsl(150,70%,50%)', 3),
('hedge', 'Hedge', 'Risk warnings and safer plays', 'Shield', 'hsl(45,90%,55%)', 4),
('shadow', 'Shadow', 'Trap watch and weakening support', 'Eye', 'hsl(0,70%,55%)', 5),
('ritual', 'Ritual', 'Cosmic windows, archetypes, branded commentary', 'Moon', 'hsl(280,90%,70%)', 6)
ON CONFLICT (mode_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_astra_mode_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode_key text NOT NULL REFERENCES public.astra_operating_modes(mode_key),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_astra_mode_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mode" ON public.user_astra_mode_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.astra_command_center_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  last_mode_key text REFERENCES public.astra_operating_modes(mode_key),
  last_query text,
  pinned_game_ids uuid[],
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.astra_command_center_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cc state" ON public.astra_command_center_state FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.astra_opportunity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id),
  player_id uuid REFERENCES public.players(id),
  opportunity_type text NOT NULL,
  headline text,
  detail text,
  mode_relevance text[] DEFAULT '{}',
  confidence numeric,
  ev_edge numeric,
  trap_score numeric,
  cosmic_boost numeric,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.astra_opportunity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read opportunities" ON public.astra_opportunity_feed FOR SELECT TO authenticated USING (true);

-- Add mode columns to astra_bet_assessment if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='astra_bet_assessment') THEN
    ALTER TABLE public.astra_bet_assessment
      ADD COLUMN IF NOT EXISTS mode_key text REFERENCES public.astra_operating_modes(mode_key),
      ADD COLUMN IF NOT EXISTS mode_adjusted_decision_score numeric,
      ADD COLUMN IF NOT EXISTS mode_adjusted_decision_label text,
      ADD COLUMN IF NOT EXISTS mode_primary_reason text,
      ADD COLUMN IF NOT EXISTS mode_warning_note text,
      ADD COLUMN IF NOT EXISTS mode_alternative_suggestion text;
  END IF;
END $$;
