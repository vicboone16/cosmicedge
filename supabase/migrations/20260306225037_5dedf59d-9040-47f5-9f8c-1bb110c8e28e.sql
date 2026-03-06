
-- Add old Live-only views to Test so the schema diff won't try to DROP them from Live
-- These are legacy views that still exist in the production database

-- 1) ce_active_prop_date
CREATE OR REPLACE VIEW public.ce_active_prop_date AS
SELECT max(game_date) AS active_game_date FROM ce_props_norm;

-- 2) ce_injury_ripple
CREATE OR REPLACE VIEW public.ce_injury_ripple AS
WITH team_missing AS (
  SELECT ce_injury_status.team_id,
    sum(COALESCE(ce_injury_status.usage_impact, 0::numeric)) AS missing_usage
  FROM ce_injury_status
  WHERE (ce_injury_status.status = ANY (ARRAY['OUT'::text, 'DOUBTFUL'::text]))
  GROUP BY ce_injury_status.team_id
)
SELECT p.prop_id, p.player_id,
  COALESCE(t.missing_usage, 0::numeric) AS missing_usage,
  CASE
    WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.30 THEN 1.10
    WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.20 THEN 1.07
    WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.10 THEN 1.04
    ELSE 1.00
  END AS injury_multiplier
FROM ce_scorecards_fast_v4 p
LEFT JOIN team_missing t ON t.team_id = p.player_id;

-- 3) ce_scorecards_top (based on v3)
CREATE OR REPLACE VIEW public.ce_scorecards_top AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v3, edge_score_v3, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v3
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v3 >= 55;

-- 4) ce_scorecards_top_v3
CREATE OR REPLACE VIEW public.ce_scorecards_top_v3 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v6 >= 58;

-- 5) ce_scorecards_top_heavy
CREATE OR REPLACE VIEW public.ce_scorecards_top_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M','PR','PA','RA'])
  AND edge_score_v6 >= 55
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 50;

-- 6) ce_scorecards_top_25
CREATE OR REPLACE VIEW public.ce_scorecards_top_25 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 25;

-- 7) ce_prop_analyzer_feed
CREATE OR REPLACE VIEW public.ce_prop_analyzer_feed AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor,
  CASE
    WHEN edge_score_v6 >= 75 THEN 'Elite'
    WHEN edge_score_v6 >= 65 THEN 'Strong'
    WHEN edge_score_v6 >= 58 THEN 'Playable'
    ELSE 'Lean'
  END AS confidence_tier
FROM ce_scorecards_top_heavy;

-- 8) ce_monte_input_heavy
CREATE OR REPLACE VIEW public.ce_monte_input_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE
    WHEN stat_key = 'PTS' THEN 6.0 WHEN stat_key = 'REB' THEN 3.0
    WHEN stat_key = 'AST' THEN 2.5 WHEN stat_key = 'FG3M' THEN 1.5
    WHEN stat_key = 'STL' THEN 0.9 WHEN stat_key = 'BLK' THEN 0.9
    WHEN stat_key = 'TOV' THEN 1.3 WHEN stat_key = 'PRA' THEN 8.0
    WHEN stat_key = 'PR' THEN 6.7 WHEN stat_key = 'PA' THEN 6.5
    WHEN stat_key = 'RA' THEN 4.0 ELSE 5.0
  END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

-- 9) ce_monte_input_top25
CREATE OR REPLACE VIEW public.ce_monte_input_top25 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE
    WHEN stat_key = 'PTS' THEN 6.0 WHEN stat_key = 'REB' THEN 3.0
    WHEN stat_key = 'AST' THEN 2.5 WHEN stat_key = 'FG3M' THEN 1.5
    WHEN stat_key = 'STL' THEN 0.9 WHEN stat_key = 'BLK' THEN 0.9
    WHEN stat_key = 'TOV' THEN 1.3 WHEN stat_key = 'PRA' THEN 8.0
    WHEN stat_key = 'PR' THEN 6.7 WHEN stat_key = 'PA' THEN 6.5
    WHEN stat_key = 'RA' THEN 4.0 ELSE 5.0
  END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_25;

-- 10) ce_monte_input_top50
CREATE OR REPLACE VIEW public.ce_monte_input_top50 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE
    WHEN stat_key = 'PTS' THEN 6.0 WHEN stat_key = 'REB' THEN 3.0
    WHEN stat_key = 'AST' THEN 2.5 WHEN stat_key = 'FG3M' THEN 1.5
    WHEN stat_key = 'STL' THEN 0.9 WHEN stat_key = 'BLK' THEN 0.9
    WHEN stat_key = 'TOV' THEN 1.3 WHEN stat_key = 'PRA' THEN 8.0
    WHEN stat_key = 'PR' THEN 6.7 WHEN stat_key = 'PA' THEN 6.5
    WHEN stat_key = 'RA' THEN 4.0 ELSE 5.0
  END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

-- 11) ce_top_*_props
CREATE OR REPLACE VIEW public.ce_top_pts_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'PTS' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_reb_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'REB' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_ast_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'AST' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_fg3m_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'FG3M' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_pra_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'PRA' ORDER BY edge_score_v6 DESC NULLS LAST;

-- 12) ce_top_targets
CREATE OR REPLACE VIEW public.ce_top_targets AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 25;

-- 13) ce_top_targets_heavy
CREATE OR REPLACE VIEW public.ce_top_targets_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 50;
