-- DROP CASCADE ce_scorecards_fast to rebuild with Live-matching definition
DROP VIEW IF EXISTS public.ce_scorecards_fast CASCADE;

-- 1. ce_scorecards_fast (Live version with astro_multiplier, base_prob, edge_score, lean)
CREATE OR REPLACE VIEW public.ce_scorecards_fast AS
WITH ranked AS (
  SELECT player_id, game_id, game_date, pts, reb, ast, fg3m, stl, blk, tov, plus_minus, pie,
    row_number() OVER (PARTITION BY player_id ORDER BY game_date DESC, game_id DESC) AS rn
  FROM ce_player_game_logs_src WHERE game_date < CURRENT_DATE
), sample AS (
  SELECT * FROM ranked WHERE rn <= 10
), agg AS (
  SELECT player_id,
    avg(pts) AS pts_mean, avg(reb) AS reb_mean, avg(ast) AS ast_mean, avg(fg3m) AS fg3m_mean,
    avg(stl) AS stl_mean, avg(blk) AS blk_mean, avg(tov) AS tov_mean,
    avg(COALESCE(pts,0::numeric)+COALESCE(reb,0::numeric)+COALESCE(ast,0::numeric)) AS pra_mean,
    stddev_samp(pts) AS pts_std, stddev_samp(reb) AS reb_std, stddev_samp(ast) AS ast_std,
    stddev_samp(fg3m) AS fg3m_std, stddev_samp(stl) AS stl_std, stddev_samp(blk) AS blk_std,
    stddev_samp(tov) AS tov_std,
    stddev_samp(COALESCE(pts,0::numeric)+COALESCE(reb,0::numeric)+COALESCE(ast,0::numeric)) AS pra_std,
    avg(COALESCE(plus_minus,0::numeric)) AS plus_minus_mean,
    avg(COALESCE(pie,0::numeric)) AS pie_mean
  FROM sample GROUP BY player_id
), props_with_proj AS (
  SELECT p.id AS prop_id, p.game_key, p.game_date, p.player_name, p.model_player_id AS player_id,
    p.stat_key, p.line_value, p.over_odds, p.under_odds, p.provider, p.vendor,
    a.plus_minus_mean, a.pie_mean,
    CASE
      WHEN p.stat_key='PTS' THEN a.pts_mean WHEN p.stat_key='REB' THEN a.reb_mean
      WHEN p.stat_key='AST' THEN a.ast_mean WHEN p.stat_key='FG3M' THEN a.fg3m_mean
      WHEN p.stat_key='STL' THEN a.stl_mean WHEN p.stat_key='BLK' THEN a.blk_mean
      WHEN p.stat_key='TOV' THEN a.tov_mean WHEN p.stat_key='PRA' THEN a.pra_mean
      WHEN p.stat_key='PR' THEN COALESCE(a.pts_mean,0::numeric)+COALESCE(a.reb_mean,0::numeric)
      WHEN p.stat_key='PA' THEN COALESCE(a.pts_mean,0::numeric)+COALESCE(a.ast_mean,0::numeric)
      WHEN p.stat_key='RA' THEN COALESCE(a.reb_mean,0::numeric)+COALESCE(a.ast_mean,0::numeric)
      ELSE NULL::numeric END AS projection_mean,
    CASE
      WHEN p.stat_key='PTS' THEN COALESCE(a.pts_std,6.0) WHEN p.stat_key='REB' THEN COALESCE(a.reb_std,3.0)
      WHEN p.stat_key='AST' THEN COALESCE(a.ast_std,2.5) WHEN p.stat_key='FG3M' THEN COALESCE(a.fg3m_std,1.5)
      WHEN p.stat_key='STL' THEN COALESCE(a.stl_std,0.9) WHEN p.stat_key='BLK' THEN COALESCE(a.blk_std,0.9)
      WHEN p.stat_key='TOV' THEN COALESCE(a.tov_std,1.3) WHEN p.stat_key='PRA' THEN COALESCE(a.pra_std,8.0)
      WHEN p.stat_key='PR' THEN sqrt(power(COALESCE(a.pts_std,6.0),2::numeric)+power(COALESCE(a.reb_std,3.0),2::numeric))
      WHEN p.stat_key='PA' THEN sqrt(power(COALESCE(a.pts_std,6.0),2::numeric)+power(COALESCE(a.ast_std,2.5),2::numeric))
      WHEN p.stat_key='RA' THEN sqrt(power(COALESCE(a.reb_std,3.0),2::numeric)+power(COALESCE(a.ast_std,2.5),2::numeric))
      ELSE NULL::numeric END AS std_dev
  FROM ce_props_norm p JOIN agg a ON a.player_id=p.model_player_id
  WHERE p.model_player_id IS NOT NULL AND p.line_value IS NOT NULL AND p.game_date=CURRENT_DATE
)
SELECT prop_id, game_key, game_date, player_name, player_id, stat_key, line_value,
  projection_mean, std_dev, plus_minus_mean, pie_mean,
  GREATEST(0.90,LEAST(1.10,1::numeric+(COALESCE(pie_mean,0::numeric)-0.10))) AS pie_multiplier,
  1.00 AS astro_multiplier,
  projection_mean*GREATEST(0.90,LEAST(1.10,1::numeric+(COALESCE(pie_mean,0::numeric)-0.10)))*1.00 AS adjusted_projection,
  1::numeric/(1::numeric+exp('-1.6'::numeric*((projection_mean*GREATEST(0.90,LEAST(1.10,1::numeric+(COALESCE(pie_mean,0::numeric)-0.10)))*1.00-line_value)/NULLIF(std_dev,0::numeric)))) AS base_prob,
  round(1::numeric/(1::numeric+exp('-1.6'::numeric*((projection_mean*GREATEST(0.90,LEAST(1.10,1::numeric+(COALESCE(pie_mean,0::numeric)-0.10)))*1.00-line_value)/NULLIF(std_dev,0::numeric))))*100::numeric)::integer AS edge_score,
  CASE WHEN (projection_mean*GREATEST(0.90,LEAST(1.10,1::numeric+(COALESCE(pie_mean,0::numeric)-0.10)))*1.00)>=line_value THEN 'OVER'::text ELSE 'UNDER'::text END AS lean,
  over_odds, under_odds, provider, vendor
FROM props_with_proj;

-- 2. ce_scorecards_fast_v2
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v2 AS
SELECT s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.adjusted_projection, s.over_odds, s.under_odds, s.provider, s.vendor,
  m.momentum_score,
  GREATEST(0.90,LEAST(1.10,1::numeric+COALESCE(m.momentum_score,0::numeric)*0.02)) AS momentum_multiplier,
  s.adjusted_projection*GREATEST(0.90,LEAST(1.10,1::numeric+COALESCE(m.momentum_score,0::numeric)*0.02)) AS adjusted_projection_v2
FROM ce_scorecards_fast s LEFT JOIN ce_momentum_live m ON m.player_id=s.player_id AND m.stat_key='PTS';

-- 3. ce_astro_live
CREATE OR REPLACE VIEW public.ce_astro_live AS
SELECT game_key, player_id, 1.00 AS astro_mean_multiplier, 1.00 AS astro_conf_multiplier, 'neutral'::text AS astro_tone
FROM ce_scorecards_fast_v2 p;

-- 4. ce_scorecards_fast_v3
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v3 AS
SELECT s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.adjusted_projection, s.over_odds, s.under_odds, s.provider, s.vendor,
  s.momentum_score, s.momentum_multiplier, s.adjusted_projection_v2,
  a.astro_mean_multiplier, a.astro_conf_multiplier, a.astro_tone,
  s.adjusted_projection_v2*COALESCE(a.astro_mean_multiplier,1.00) AS adjusted_projection_v3,
  round(1::numeric/(1::numeric+exp('-1.6'::numeric*((s.adjusted_projection_v2*COALESCE(a.astro_mean_multiplier,1.00)-s.line_value)/NULLIF(s.std_dev,0::numeric))))*COALESCE(a.astro_conf_multiplier,1.00)*100::numeric)::integer AS edge_score_v3
FROM ce_scorecards_fast_v2 s LEFT JOIN ce_astro_live a ON a.game_key=s.game_key AND a.player_id=s.player_id;

-- 5. ce_scorecards_top
CREATE OR REPLACE VIEW public.ce_scorecards_top AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v3, edge_score_v3, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v3
WHERE stat_key IN ('PTS','REB','AST','PRA','FG3M') AND edge_score_v3 >= 55;

-- 6. ce_scorecards_fast_v4
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v4 AS
SELECT s.prop_id, s.game_key, s.game_date, COALESCE(st.player_name,s.player_name) AS player_name, s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.astro_mean_multiplier, s.astro_conf_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier,
  st.streak_flag, st.streak_multiplier,
  s.adjusted_projection_v3*COALESCE(st.streak_multiplier,1.00) AS adjusted_projection_v4,
  round(1::numeric/(1::numeric+exp('-1.6'::numeric*((s.adjusted_projection_v3*COALESCE(st.streak_multiplier,1.00)-s.line_value)/NULLIF(s.std_dev,0::numeric))))*100::numeric)::integer AS edge_score_v4,
  s.over_odds, s.under_odds, s.provider, s.vendor
FROM ce_scorecards_fast_v3 s LEFT JOIN ce_streaks_live st ON st.prop_id=s.prop_id;

-- 7. ce_injury_ripple
CREATE OR REPLACE VIEW public.ce_injury_ripple AS
WITH team_missing AS (
  SELECT team_id, sum(COALESCE(usage_impact,0::numeric)) AS missing_usage
  FROM ce_injury_status WHERE status IN ('OUT','DOUBTFUL') GROUP BY team_id
)
SELECT p.prop_id, p.player_id, COALESCE(t.missing_usage,0::numeric) AS missing_usage,
  CASE WHEN COALESCE(t.missing_usage,0::numeric)>=0.30 THEN 1.10
       WHEN COALESCE(t.missing_usage,0::numeric)>=0.20 THEN 1.07
       WHEN COALESCE(t.missing_usage,0::numeric)>=0.10 THEN 1.04
       ELSE 1.00 END AS injury_multiplier
FROM ce_scorecards_fast_v4 p LEFT JOIN team_missing t ON t.team_id=p.player_id;

-- 8. ce_scorecards_fast_v5
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v5 AS
SELECT s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.astro_mean_multiplier, s.astro_conf_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier, s.streak_flag, s.streak_multiplier,
  s.adjusted_projection_v4, s.edge_score_v4, s.over_odds, s.under_odds, s.provider, s.vendor,
  COALESCE(io.injury_multiplier,1.00) AS injury_multiplier,
  s.adjusted_projection_v4*COALESCE(io.injury_multiplier,1.00) AS adjusted_projection_v5,
  round(1::numeric/(1::numeric+exp('-1.6'::numeric*((s.adjusted_projection_v4*COALESCE(io.injury_multiplier,1.00)-s.line_value)/NULLIF(s.std_dev,0::numeric))))*100::numeric)::integer AS edge_score_v5
FROM ce_scorecards_fast_v4 s LEFT JOIN ce_injury_overrides io ON io.player_id=s.player_id;

-- 9. ce_scorecards_fast_v6
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v6 AS
SELECT s.prop_id, s.game_key, s.game_date, s.player_name, s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.astro_mean_multiplier, s.astro_conf_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier, s.streak_flag, s.streak_multiplier,
  s.adjusted_projection_v4, s.edge_score_v4, s.over_odds, s.under_odds, s.provider, s.vendor,
  s.injury_multiplier, s.adjusted_projection_v5, s.edge_score_v5,
  COALESCE(mo.matchup_multiplier,1.00) AS matchup_multiplier,
  s.adjusted_projection_v5*COALESCE(mo.matchup_multiplier,1.00) AS adjusted_projection_v6,
  round(1::numeric/(1::numeric+exp('-1.6'::numeric*((s.adjusted_projection_v5*COALESCE(mo.matchup_multiplier,1.00)-s.line_value)/NULLIF(s.std_dev,0::numeric))))*100::numeric)::integer AS edge_score_v6
FROM ce_scorecards_fast_v5 s LEFT JOIN ce_matchup_overrides mo ON mo.player_id=s.player_id AND mo.stat_key=s.stat_key;

-- 10. ce_scorecards_top_v3
CREATE OR REPLACE VIEW public.ce_scorecards_top_v3 AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key IN ('PTS','REB','AST','PRA','FG3M') AND edge_score_v6 >= 58;

-- 11. ce_scorecards_top_25
CREATE OR REPLACE VIEW public.ce_scorecards_top_25 AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3 ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 25;

-- 12. ce_monte_input_top25
CREATE OR REPLACE VIEW public.ce_monte_input_top25 AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
       WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
       WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
       WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_25;

-- 13. ce_top_targets
CREATE OR REPLACE VIEW public.ce_top_targets AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_v3 ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 25;

-- 14. ce_scorecards_top_heavy
CREATE OR REPLACE VIEW public.ce_scorecards_top_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_fast_v6
WHERE stat_key IN ('PTS','REB','AST','PRA','FG3M','PR','PA','RA') AND edge_score_v6 >= 55
ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 50;

-- 15. ce_monte_input_heavy
CREATE OR REPLACE VIEW public.ce_monte_input_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
       WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
       WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
       WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

-- 16. ce_top_targets_heavy
CREATE OR REPLACE VIEW public.ce_top_targets_heavy AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy ORDER BY edge_score_v6 DESC NULLS LAST LIMIT 50;

-- 17. ce_monte_input_top50
CREATE OR REPLACE VIEW public.ce_monte_input_top50 AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6 AS projection_mean,
  CASE WHEN stat_key='PTS' THEN 6.0 WHEN stat_key='REB' THEN 3.0 WHEN stat_key='AST' THEN 2.5
       WHEN stat_key='FG3M' THEN 1.5 WHEN stat_key='STL' THEN 0.9 WHEN stat_key='BLK' THEN 0.9
       WHEN stat_key='TOV' THEN 1.3 WHEN stat_key='PRA' THEN 8.0 WHEN stat_key='PR' THEN 6.7
       WHEN stat_key='PA' THEN 6.5 WHEN stat_key='RA' THEN 4.0 ELSE 5.0 END AS sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
FROM ce_scorecards_top_heavy;

-- 18. ce_prop_analyzer_feed
CREATE OR REPLACE VIEW public.ce_prop_analyzer_feed AS
SELECT player_name, player_id, game_key, stat_key, line_value, adjusted_projection_v6, edge_score_v6,
  streak_flag, injury_multiplier, matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor,
  CASE WHEN edge_score_v6>=75 THEN 'Elite' WHEN edge_score_v6>=65 THEN 'Strong'
       WHEN edge_score_v6>=58 THEN 'Playable' ELSE 'Lean' END AS confidence_tier
FROM ce_scorecards_top_heavy;

-- 19-23. Stat-specific views
CREATE OR REPLACE VIEW public.ce_top_pts_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key='PTS' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_pra_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key='PRA' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_ast_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key='AST' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_reb_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key='REB' ORDER BY edge_score_v6 DESC NULLS LAST;

CREATE OR REPLACE VIEW public.ce_top_fg3m_props AS
SELECT * FROM ce_prop_analyzer_feed WHERE stat_key='FG3M' ORDER BY edge_score_v6 DESC NULLS LAST;