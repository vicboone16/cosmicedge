
-- Live Prop State: computed intelligence for each active prop
CREATE TABLE IF NOT EXISTS public.live_prop_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
  prop_type TEXT NOT NULL,
  line NUMERIC NOT NULL,
  period_scope TEXT NOT NULL DEFAULT 'full',
  
  -- Live stat data
  current_value NUMERIC DEFAULT 0,
  minutes_played NUMERIC DEFAULT 0,
  foul_count INT DEFAULT 0,
  
  -- Projections
  projected_final NUMERIC,
  projected_minutes NUMERIC,
  stat_rate NUMERIC,
  pace_pct NUMERIC,
  
  -- Probability engine
  hit_probability NUMERIC,
  implied_probability NUMERIC,
  live_edge NUMERIC,
  expected_return NUMERIC,
  
  -- Risk scores
  live_confidence NUMERIC,
  volatility NUMERIC,
  minutes_security_score NUMERIC,
  blowout_probability NUMERIC,
  foul_risk_level TEXT DEFAULT 'low',
  
  -- Status
  status_label TEXT DEFAULT 'pregame',
  
  -- Astro
  astro_risk_modifier NUMERIC DEFAULT 1.0,
  astro_note TEXT,
  
  -- Meta
  game_quarter INT,
  game_clock TEXT,
  home_score INT,
  away_score INT,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(game_id, player_id, prop_type, line, period_scope)
);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_prop_state;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_live_prop_state_game ON public.live_prop_state(game_id);
CREATE INDEX IF NOT EXISTS idx_live_prop_state_player ON public.live_prop_state(player_id);
CREATE INDEX IF NOT EXISTS idx_live_prop_state_status ON public.live_prop_state(status_label);

-- RLS: public read (computed data), service-role write
ALTER TABLE public.live_prop_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live prop state"
  ON public.live_prop_state FOR SELECT
  TO authenticated, anon
  USING (true);
