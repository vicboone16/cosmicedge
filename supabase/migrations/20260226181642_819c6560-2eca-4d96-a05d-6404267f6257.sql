
-- ═══ model_game_predictions: versioned, never-overwrite predictions ═══
CREATE TABLE IF NOT EXISTS public.model_game_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sport text NOT NULL,
  model_name text NOT NULL DEFAULT 'oracle_ml',
  model_version text NOT NULL DEFAULT 'v1',
  run_ts timestamptz NOT NULL DEFAULT now(),
  mu_home numeric,
  mu_away numeric,
  mu_total numeric,
  mu_spread_home numeric,
  p_home_win numeric,
  p_away_win numeric,
  fair_ml_home integer,
  fair_ml_away integer,
  expected_possessions numeric,
  blowout_risk numeric,
  book_implied_home numeric,
  edge_home numeric,
  edge_away numeric,
  p_home_win_ci_low numeric,
  p_home_win_ci_high numeric,
  qtr_wp_home jsonb,
  qtr_fair_ml jsonb,
  features_json jsonb DEFAULT '{}'::jsonb,
  notes_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups: latest prediction per game/model/version
CREATE INDEX idx_mgp_game_model ON public.model_game_predictions (game_id, model_name, model_version, run_ts DESC);
CREATE INDEX idx_mgp_sport_run ON public.model_game_predictions (sport, run_ts DESC);

-- RLS: public read, service-role write
ALTER TABLE public.model_game_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read model_game_predictions" ON public.model_game_predictions
  FOR SELECT USING (true);

-- ═══ Sport-specific views: latest v1 prediction per game ═══

-- NBA
CREATE OR REPLACE VIEW public.v_oracle_ml_nba_v1 AS
SELECT DISTINCT ON (mgp.game_id)
  mgp.*,
  g.home_abbr, g.away_abbr, g.home_team, g.away_team,
  g.start_time, g.status, g.home_score, g.away_score
FROM public.model_game_predictions mgp
JOIN public.games g ON g.id = mgp.game_id
WHERE mgp.sport = 'NBA' AND mgp.model_name = 'oracle_ml' AND mgp.model_version = 'v1'
ORDER BY mgp.game_id, mgp.run_ts DESC;

-- NFL
CREATE OR REPLACE VIEW public.v_oracle_ml_nfl_v1 AS
SELECT DISTINCT ON (mgp.game_id)
  mgp.*,
  g.home_abbr, g.away_abbr, g.home_team, g.away_team,
  g.start_time, g.status, g.home_score, g.away_score
FROM public.model_game_predictions mgp
JOIN public.games g ON g.id = mgp.game_id
WHERE mgp.sport = 'NFL' AND mgp.model_name = 'oracle_ml' AND mgp.model_version = 'v1'
ORDER BY mgp.game_id, mgp.run_ts DESC;

-- NHL
CREATE OR REPLACE VIEW public.v_oracle_ml_nhl_v1 AS
SELECT DISTINCT ON (mgp.game_id)
  mgp.*,
  g.home_abbr, g.away_abbr, g.home_team, g.away_team,
  g.start_time, g.status, g.home_score, g.away_score
FROM public.model_game_predictions mgp
JOIN public.games g ON g.id = mgp.game_id
WHERE mgp.sport = 'NHL' AND mgp.model_name = 'oracle_ml' AND mgp.model_version = 'v1'
ORDER BY mgp.game_id, mgp.run_ts DESC;

-- MLB
CREATE OR REPLACE VIEW public.v_oracle_ml_mlb_v1 AS
SELECT DISTINCT ON (mgp.game_id)
  mgp.*,
  g.home_abbr, g.away_abbr, g.home_team, g.away_team,
  g.start_time, g.status, g.home_score, g.away_score
FROM public.model_game_predictions mgp
JOIN public.games g ON g.id = mgp.game_id
WHERE mgp.sport = 'MLB' AND mgp.model_name = 'oracle_ml' AND mgp.model_version = 'v1'
ORDER BY mgp.game_id, mgp.run_ts DESC;
