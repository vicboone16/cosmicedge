
-- ============================================================
-- Phase 1A: Model Engine Schema
-- ============================================================

-- 1) models_registry
CREATE TABLE public.models_registry (
  model_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  model_type text NOT NULL CHECK (model_type IN ('distribution','environment','addon','baseline','ensemble')),
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  config_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.models_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "models_registry_read_all" ON public.models_registry FOR SELECT USING (true);
CREATE POLICY "models_registry_admin_write" ON public.models_registry FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 2) model_runs (one row per batch execution)
CREATE TABLE public.model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL REFERENCES public.models_registry(model_key),
  snapshot_ts timestamptz NOT NULL DEFAULT now(),
  input_hash text,
  run_meta jsonb DEFAULT '{}',
  rows_produced int NOT NULL DEFAULT 0,
  duration_ms int,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_runs_read_all" ON public.model_runs FOR SELECT USING (true);
CREATE POLICY "model_runs_admin_write" ON public.model_runs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_model_runs_key_ts ON public.model_runs (model_key, snapshot_ts DESC);

-- 3) model_predictions (per-prop prediction from any model/baseline)
CREATE TABLE public.model_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.model_runs(id),
  model_key text NOT NULL REFERENCES public.models_registry(model_key),
  snapshot_ts timestamptz NOT NULL DEFAULT now(),
  game_id uuid NOT NULL,
  player_id uuid NOT NULL,
  prop_type text NOT NULL,
  line numeric,
  odds int,
  -- NebulaProp core
  mu_base numeric,
  sigma_base numeric,
  p_over_base numeric,
  -- PacePulse
  expected_possessions numeric,
  blowout_risk numeric,
  team_pace_delta numeric,
  -- TransitLift
  astro_mu_adjust numeric DEFAULT 0,
  astro_sigma_adjust numeric DEFAULT 0,
  -- Final ensemble
  mu_final numeric,
  sigma_final numeric,
  p_over_final numeric,
  -- EdgeScore
  edge_score numeric,
  edge_hitl10 numeric,
  edge_minutes numeric,
  edge_matchup numeric,
  edge_line_move numeric,
  edge_season numeric,
  edge_vol_penalty numeric,
  edge_astro numeric,
  -- Features snapshot
  hit_l5 numeric,
  hit_l10 numeric,
  hit_l20 numeric,
  std_dev_l10 numeric,
  coeff_of_var numeric,
  minutes_l5_avg numeric,
  minutes_season_avg numeric,
  delta_minutes numeric,
  open_line numeric,
  current_line numeric,
  line_delta numeric,
  -- Tags
  tags text[] DEFAULT '{}',
  -- Side / recommendation
  side text,
  one_liner text,
  quality_flags text[] DEFAULT '{}',
  input_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_key, snapshot_ts, game_id, player_id, prop_type)
);

ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_predictions_read_all" ON public.model_predictions FOR SELECT USING (true);
CREATE POLICY "model_predictions_admin_write" ON public.model_predictions FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_model_preds_game ON public.model_predictions (game_id, model_key);
CREATE INDEX idx_model_preds_player ON public.model_predictions (player_id, prop_type);
CREATE INDEX idx_model_preds_ts ON public.model_predictions (snapshot_ts DESC);

-- 4) model_backtest_results (evaluation metrics per model per split)
CREATE TABLE public.model_backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL REFERENCES public.models_registry(model_key),
  split_name text NOT NULL DEFAULT 'test',
  prop_type text,
  sample_size int NOT NULL DEFAULT 0,
  log_loss numeric,
  brier_score numeric,
  calibration_json jsonb,
  clv_pct numeric,
  roi_pct numeric,
  mae numeric,
  r_squared numeric,
  extra_metrics jsonb DEFAULT '{}',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backtest_results_read_all" ON public.model_backtest_results FOR SELECT USING (true);
CREATE POLICY "backtest_results_admin_write" ON public.model_backtest_results FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 5) model_dataset_split (records which props belong to train vs test)
CREATE TABLE public.model_dataset_split (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  player_id uuid NOT NULL,
  prop_type text NOT NULL,
  game_date date NOT NULL,
  split text NOT NULL CHECK (split IN ('train','test')),
  actual_stat numeric,
  closing_line numeric,
  closing_odds int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id, prop_type)
);

ALTER TABLE public.model_dataset_split ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dataset_split_read_all" ON public.model_dataset_split FOR SELECT USING (true);
CREATE POLICY "dataset_split_admin_write" ON public.model_dataset_split FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dataset_split_date ON public.model_dataset_split (game_date);
CREATE INDEX idx_dataset_split_split ON public.model_dataset_split (split);

-- Seed the 3 core models + 5 baselines into the registry
INSERT INTO public.models_registry (model_key, display_name, description, model_type, version) VALUES
  ('nebula_v1',           'NebulaProp v1',           'Core distribution model (mu/sigma/p_over)',          'distribution', '1.0'),
  ('pacepulse_v1',        'PacePulse v1',            'Game environment: possessions, blowout risk, pace',  'environment',  '1.0'),
  ('transitlift_v1',      'TransitLift v1',          'Constrained astro mu/sigma adjustments',             'addon',        '1.0'),
  ('ensemble_v1',         'Ensemble v1',             'Combined NebulaProp + PacePulse + TransitLift',      'ensemble',     '1.0'),
  ('baseline_rolling_l10','Baseline Rolling L10',    'Rolling 10-game average',                            'baseline',     '1.0'),
  ('baseline_season',     'Baseline Season Avg',     'Full season average',                                'baseline',     '1.0'),
  ('baseline_implied',    'Baseline Implied Prob',   'Sportsbook implied probability',                     'baseline',     '1.0'),
  ('baseline_heuristics', 'Baseline Public Heuristics','Rule-based hit-rate filters',                      'baseline',     '1.0'),
  ('baseline_lr',         'Baseline Linear Reg',     'Linear regression benchmark',                        'baseline',     '1.0'),
  ('baseline_rf',         'Baseline Random Forest',  'Random forest benchmark',                            'baseline',     '1.0'),
  ('baseline_gb',         'Baseline Gradient Boost',  'Gradient boosting benchmark',                       'baseline',     '1.0');

-- updated_at triggers
CREATE TRIGGER update_models_registry_ts BEFORE UPDATE ON public.models_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
