-- Drop all CE views that exist on shadow DB but NOT on Test/Live
-- This aligns the shadow with actual deployed state

DROP VIEW IF EXISTS public.ce_parlay_top_plays CASCADE;
DROP VIEW IF EXISTS public.ce_parlay_probabilities CASCADE;
DROP VIEW IF EXISTS public.ce_parlay_pair_scored CASCADE;
DROP VIEW IF EXISTS public.ce_parlay_pairs CASCADE;
DROP VIEW IF EXISTS public.ce_same_player_corr CASCADE;
DROP VIEW IF EXISTS public.ce_glossary_featured CASCADE;
DROP VIEW IF EXISTS public.ce_formulas_featured CASCADE;
DROP VIEW IF EXISTS public.ce_info_pages_published CASCADE;
DROP VIEW IF EXISTS public.ce_engine_registry_active CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel_top_plays CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_correlation_flags CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v9 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v8 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v7 CASCADE;
DROP VIEW IF EXISTS public.ce_player_current_team CASCADE;
DROP VIEW IF EXISTS public.ce_matchup_difficulty_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v4 CASCADE;

-- Rebuild downstream views that SHOULD exist (matching Test/Live state)
CREATE OR REPLACE VIEW public.ce_scorecards_top AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v3, edge_score_v3, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v3
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v3 >= 55;

CREATE OR REPLACE VIEW public.ce_scorecards_top_v3 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M'])
  AND edge_score_v6 >= 58;

CREATE OR REPLACE VIEW public.ce_scorecards_top_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key = ANY (ARRAY['PTS','REB','AST','PRA','FG3M','PR','PA','RA'])
  AND edge_score_v6 >= 55
ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 50;

CREATE OR REPLACE VIEW public.ce_scorecards_top_25 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3
ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 25;

CREATE OR REPLACE VIEW public.ce_prop_analyzer_feed AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor,
  CASE WHEN edge_score_v6 >= 75 THEN 'Elite' WHEN edge_score_v6 >= 65 THEN 'Strong'
    WHEN edge_score_v6 >= 58 THEN 'Playable' ELSE 'Lean' END AS confidence_tier
FROM ce_scorecards_top_heavy;

CREATE OR REPLACE VIEW public.ce_monte_input_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
    WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
    WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
    WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

CREATE OR REPLACE VIEW public.ce_monte_input_top25 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
    WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
    WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
    WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_25;

CREATE OR REPLACE VIEW public.ce_monte_input_top50 AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
    WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
    WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
    WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

CREATE OR REPLACE VIEW public.ce_top_pts_props AS SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'PTS' ORDER BY edge_score_v6 DESC NULLS LAST;
CREATE OR REPLACE VIEW public.ce_top_reb_props AS SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'REB' ORDER BY edge_score_v6 DESC NULLS LAST;
CREATE OR REPLACE VIEW public.ce_top_ast_props AS SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'AST' ORDER BY edge_score_v6 DESC NULLS LAST;
CREATE OR REPLACE VIEW public.ce_top_fg3m_props AS SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'FG3M' ORDER BY edge_score_v6 DESC NULLS LAST;
CREATE OR REPLACE VIEW public.ce_top_pra_props AS SELECT * FROM ce_prop_analyzer_feed WHERE stat_key = 'PRA' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_targets AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3 ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 25;

CREATE OR REPLACE VIEW public.ce_top_targets_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 50;