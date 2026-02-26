
-- Game-level predictions (pregame Oracle + live WP snapshots)
CREATE TABLE public.game_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL DEFAULT 'oracle_v1',
  sport TEXT NOT NULL DEFAULT 'NBA',
  run_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Pregame score projections
  mu_home NUMERIC,
  mu_away NUMERIC,
  mu_total NUMERIC,
  mu_spread_home NUMERIC,
  
  -- Win probability
  p_home_win NUMERIC,
  p_away_win NUMERIC,
  
  -- Fair moneyline (no vig)
  fair_ml_home INTEGER,
  fair_ml_away INTEGER,
  
  -- Confidence intervals
  p_home_win_ci_low NUMERIC,
  p_home_win_ci_high NUMERIC,
  
  -- Model inputs snapshot
  home_off_rtg NUMERIC,
  home_def_rtg NUMERIC,
  away_off_rtg NUMERIC,
  away_def_rtg NUMERIC,
  home_pace NUMERIC,
  away_pace NUMERIC,
  expected_possessions NUMERIC,
  blowout_risk NUMERIC,
  
  -- Edge vs book
  book_implied_home NUMERIC,
  edge_home NUMERIC,
  edge_away NUMERIC,
  
  -- Live WP fields (updated during game)
  is_live BOOLEAN DEFAULT false,
  live_wp_home NUMERIC,
  live_score_diff INTEGER,
  live_time_remaining INTEGER,
  live_quarter INTEGER,
  live_possession TEXT,
  
  -- Quarter-level predictions
  qtr_wp_home JSONB,
  qtr_fair_ml JSONB,
  
  -- Meta
  notes_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_game_predictions_game_model UNIQUE (game_id, model_key, is_live)
);

-- Index for quick lookups
CREATE INDEX idx_game_predictions_game ON public.game_predictions(game_id);
CREATE INDEX idx_game_predictions_sport_date ON public.game_predictions(sport, run_ts);

-- RLS: read for everyone, write for service role / admin
ALTER TABLE public.game_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game predictions"
  ON public.game_predictions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage game predictions"
  ON public.game_predictions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Realtime for live WP updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_predictions;
