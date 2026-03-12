
-- ═══════════════════════════════════════════════════
-- Scorecard View Chain v2-v9 + Supporting Views
-- Single transactional block, dependency-ordered
-- ═══════════════════════════════════════════════════

-- 1. ce_player_current_team: latest team for each player
CREATE OR REPLACE VIEW public.ce_player_current_team AS
SELECT DISTINCT ON (player_id)
  player_id,
  team_id
FROM ce_player_game_logs_src
WHERE game_date >= CURRENT_DATE - interval '60 days'
ORDER BY player_id, game_date DESC, game_id DESC;

-- 2. ce_correlation_flags: boolean flags from stat correlations
CREATE OR REPLACE VIEW public.ce_correlation_flags AS
SELECT
  player_id,
  CASE WHEN pts_ast_corr > 0.40 THEN true ELSE false END AS pts_ast_correlated,
  CASE WHEN pts_reb_corr > 0.40 THEN true ELSE false END AS pts_reb_correlated,
  CASE WHEN reb_ast_corr > 0.40 THEN true ELSE false END AS reb_ast_correlated,
  pts_ast_corr,
  pts_reb_corr,
  reb_ast_corr
FROM ce_stat_correlations;

-- 3. v2: + momentum
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v2 AS
SELECT
  s.*,
  COALESCE(m.momentum_score, 0) AS momentum_score,
  GREATEST(0.90, LEAST(1.10, 1 + COALESCE(m.momentum_score, 0) * 0.02)) AS momentum_multiplier,
  s.adjusted_projection
    * GREATEST(0.90, LEAST(1.10, 1 + COALESCE(m.momentum_score, 0) * 0.02))
    AS adjusted_projection_v2,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection * GREATEST(0.90, LEAST(1.10, 1 + COALESCE(m.momentum_score, 0) * 0.02)) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v2
FROM ce_scorecards_fast s
LEFT JOIN ce_momentum_live m ON m.player_id = s.player_id;

-- 4. v3: + astro overrides
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v3 AS
SELECT
  s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id,
  s.stat_key, s.line_value, s.projection_mean, s.std_dev,
  s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  COALESCE(ao.astro_mean_multiplier, s.astro_multiplier) AS astro_multiplier,
  COALESCE(ao.astro_tone, 'neutral') AS astro_tone,
  s.momentum_score, s.momentum_multiplier,
  s.adjusted_projection_v2
    * COALESCE(ao.astro_mean_multiplier, 1.0)
    AS adjusted_projection_v3,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v2 * COALESCE(ao.astro_mean_multiplier, 1.0) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v3,
  s.over_odds, s.under_odds, s.provider, s.vendor
FROM ce_scorecards_fast_v2 s
LEFT JOIN ce_astro_overrides ao ON ao.player_id = s.player_id;

-- 5. v4: + streaks
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v4 AS
SELECT
  s.*,
  COALESCE(st.streak_flag, 'NEUTRAL') AS streak_flag,
  COALESCE(st.streak_multiplier, 1.0) AS streak_multiplier
FROM ce_scorecards_fast_v3 s
LEFT JOIN ce_streaks_live st ON st.prop_id = s.prop_id;

-- 6. v5: + injury overrides
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v5 AS
SELECT
  s.*,
  COALESCE(io.injury_multiplier, 1.0) AS injury_multiplier,
  s.adjusted_projection_v3
    * COALESCE(st_m.streak_multiplier, s.streak_multiplier)
    * COALESCE(io.injury_multiplier, 1.0)
    AS adjusted_projection_v5,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v3 * COALESCE(s.streak_multiplier, 1.0) * COALESCE(io.injury_multiplier, 1.0) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v5
FROM ce_scorecards_fast_v4 s
LEFT JOIN ce_injury_overrides io ON io.player_id = s.player_id
LEFT JOIN ce_streaks_live st_m ON st_m.prop_id = s.prop_id;

-- 7. v6: + matchup overrides
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v6 AS
SELECT
  s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id,
  s.stat_key, s.line_value, s.projection_mean, s.std_dev,
  s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.astro_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier,
  s.streak_flag, s.streak_multiplier,
  s.injury_multiplier,
  COALESCE(mo.matchup_multiplier, 1.0) AS matchup_multiplier,
  s.adjusted_projection_v5
    * COALESCE(mo.matchup_multiplier, 1.0)
    AS adjusted_projection_v6,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v5 * COALESCE(mo.matchup_multiplier, 1.0) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v6,
  s.over_odds, s.under_odds, s.provider, s.vendor
FROM ce_scorecards_fast_v5 s
LEFT JOIN ce_matchup_overrides mo ON mo.player_id = s.player_id AND mo.stat_key = s.stat_key;

-- 8. v7: + defense difficulty (via player's current team → opponent)
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v7 AS
SELECT
  s.*,
  COALESCE(dd.difficulty_multiplier, 1.0) AS defense_difficulty_multiplier,
  s.adjusted_projection_v6
    * COALESCE(dd.difficulty_multiplier, 1.0)
    AS adjusted_projection_v7,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v6 * COALESCE(dd.difficulty_multiplier, 1.0) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v7
FROM ce_scorecards_fast_v6 s
LEFT JOIN ce_player_current_team pct ON pct.player_id = s.player_id
LEFT JOIN ce_defense_difficulty dd ON dd.opponent_team_id = pct.team_id AND dd.stat_key = s.stat_key;

-- 9. v8: + usage shift
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v8 AS
SELECT
  s.*,
  COALESCE(us.ripple_multiplier_auto, 1.0) AS usage_shift_multiplier,
  s.adjusted_projection_v7
    * COALESCE(us.ripple_multiplier_auto, 1.0)
    AS adjusted_projection_v8,
  round(1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v7 * COALESCE(us.ripple_multiplier_auto, 1.0) - s.line_value)
    / NULLIF(s.std_dev, 0)
  ))) * 100)::int AS edge_score_v8
FROM ce_scorecards_fast_v7 s
LEFT JOIN ce_usage_shift us ON us.player_id = s.player_id;

-- 10. v9: SUPERMODEL (+ correlation flags)
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v9 AS
SELECT
  s.*,
  COALESCE(cf.pts_ast_correlated, false) AS pts_ast_correlated,
  COALESCE(cf.pts_reb_correlated, false) AS pts_reb_correlated,
  COALESCE(cf.reb_ast_correlated, false) AS reb_ast_correlated,
  COALESCE(cf.pts_ast_corr, 0) AS pts_ast_corr,
  COALESCE(cf.pts_reb_corr, 0) AS pts_reb_corr,
  COALESCE(cf.reb_ast_corr, 0) AS reb_ast_corr,
  s.adjusted_projection_v8 AS adjusted_projection_v9,
  s.edge_score_v8 AS edge_score_v9,
  CASE
    WHEN s.edge_score_v8 >= 70 THEN 'Elite'
    WHEN s.edge_score_v8 >= 60 THEN 'Strong'
    WHEN s.edge_score_v8 >= 50 THEN 'Lean'
    WHEN s.edge_score_v8 >= 40 THEN 'Marginal'
    ELSE 'Fade'
  END AS confidence_tier,
  CASE
    WHEN s.adjusted_projection_v8 >= s.line_value THEN 'OVER'
    ELSE 'UNDER'
  END AS supermodel_lean
FROM ce_scorecards_fast_v8 s
LEFT JOIN ce_correlation_flags cf ON cf.player_id = s.player_id;

-- 11. ce_supermodel: alias view
CREATE OR REPLACE VIEW public.ce_supermodel AS
SELECT * FROM ce_scorecards_fast_v9;

-- 12. Top plays views
CREATE OR REPLACE VIEW public.ce_supermodel_top_plays AS
SELECT *
FROM ce_scorecards_fast_v9
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M','PR','PA','RA'])
  AND edge_score_v9 >= 58
ORDER BY edge_score_v9 DESC
LIMIT 50;

CREATE OR REPLACE VIEW public.ce_scorecards_top_v4 AS
SELECT *
FROM ce_scorecards_fast_v9
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v9 >= 55
ORDER BY edge_score_v9 DESC;

CREATE OR REPLACE VIEW public.ce_scorecards_top_25_v4 AS
SELECT *
FROM ce_scorecards_fast_v9
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v9 >= 55
ORDER BY edge_score_v9 DESC
LIMIT 25;

-- 13. Monte Carlo input views
CREATE OR REPLACE VIEW public.ce_monte_input_heavy_v5 AS
SELECT
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v9 AS projection_mean,
  std_dev AS projection_std,
  edge_score_v9 AS edge_score,
  supermodel_lean AS lean,
  confidence_tier
FROM ce_scorecards_fast_v9
WHERE edge_score_v9 >= 55
  AND stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M','PR','PA','RA']);

CREATE OR REPLACE VIEW public.ce_monte_input_supermodel AS
SELECT
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v9 AS projection_mean,
  std_dev AS projection_std,
  edge_score_v9 AS edge_score,
  supermodel_lean AS lean,
  confidence_tier,
  momentum_multiplier, streak_multiplier, injury_multiplier,
  matchup_multiplier, defense_difficulty_multiplier,
  usage_shift_multiplier, astro_multiplier,
  pts_ast_correlated, pts_reb_correlated, reb_ast_correlated
FROM ce_scorecards_fast_v9;

-- 14. ce_game_predictions table
CREATE TABLE IF NOT EXISTS public.ce_game_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  model_key text NOT NULL DEFAULT 'stellarline_v1',
  sport text NOT NULL DEFAULT 'NBA',
  p_home_win numeric,
  p_away_win numeric,
  fair_ml_home int,
  fair_ml_away int,
  mu_home numeric,
  mu_away numeric,
  mu_total numeric,
  mu_spread_home numeric,
  edge_home numeric,
  edge_away numeric,
  blowout_risk numeric,
  expected_possessions numeric,
  home_off_rtg numeric,
  home_def_rtg numeric,
  away_off_rtg numeric,
  away_def_rtg numeric,
  home_pace numeric,
  away_pace numeric,
  home_net_rating numeric,
  away_net_rating numeric,
  notes_json jsonb,
  book_implied_home numeric,
  run_ts timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, model_key)
);

ALTER TABLE public.ce_game_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game predictions"
  ON public.ce_game_predictions FOR SELECT
  TO authenticated, anon
  USING (true);
