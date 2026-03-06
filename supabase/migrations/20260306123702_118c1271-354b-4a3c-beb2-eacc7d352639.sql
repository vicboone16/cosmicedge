
-- View: tt_best_opportunities  (live matches ranked by edge)
CREATE OR REPLACE VIEW public.tt_best_opportunities AS
SELECT
  d.match_id,
  d.player_a,
  d.player_b,
  d.score_a,
  d.score_b,
  d.next_server,
  d.serves_left,
  d.status,
  d.win_prob_a,
  d.ml_edge,
  d.spread_edge_m15 AS spread_edge,
  GREATEST(
    COALESCE(ABS(d.ml_edge), 0),
    COALESCE(ABS(d.spread_edge_m15), 0),
    COALESCE(ABS(d.over_edge_185), 0),
    COALESCE(ABS(d.under_edge_185), 0)
  ) AS best_edge,
  d.best_bet_tag
FROM public.tt_admin_dashboard d
WHERE d.status = 'live'
ORDER BY GREATEST(
  COALESCE(ABS(d.ml_edge), 0),
  COALESCE(ABS(d.spread_edge_m15), 0),
  COALESCE(ABS(d.over_edge_185), 0),
  COALESCE(ABS(d.under_edge_185), 0)
) DESC;

-- View: tt_momentum_signal  (detect win_prob swings)
CREATE OR REPLACE VIEW public.tt_momentum_signal AS
WITH recent_points AS (
  SELECT
    pl.match_id,
    pl.winner,
    pl.score_a_after,
    pl.score_b_after,
    pl.id,
    ROW_NUMBER() OVER (PARTITION BY pl.match_id ORDER BY pl.id DESC) AS rn
  FROM public.tt_point_log pl
),
last_few AS (
  SELECT match_id,
    COUNT(*) FILTER (WHERE winner = 'A' AND rn <= 5) AS a_last5,
    COUNT(*) FILTER (WHERE winner = 'B' AND rn <= 5) AS b_last5,
    COUNT(*) FILTER (WHERE rn <= 5) AS total_last5
  FROM recent_points
  WHERE rn <= 5
  GROUP BY match_id
)
SELECT
  d.match_id,
  d.player_a,
  d.player_b,
  d.win_prob_a,
  CASE
    WHEN lf.a_last5 >= 4 THEN 'A_HOT'
    WHEN lf.b_last5 >= 4 THEN 'B_HOT'
    ELSE 'NEUTRAL'
  END AS momentum_level,
  ROUND((lf.a_last5::numeric / GREATEST(lf.total_last5, 1)) - 0.5, 3) AS win_prob_jump
FROM public.tt_admin_dashboard d
LEFT JOIN last_few lf ON lf.match_id = d.match_id
WHERE d.status = 'live';
