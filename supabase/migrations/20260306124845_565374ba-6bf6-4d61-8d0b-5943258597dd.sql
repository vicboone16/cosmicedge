-- Recreate tt_admin_dashboard using CTE approach (no external table deps)
CREATE OR REPLACE VIEW public.tt_admin_dashboard AS
WITH match_data AS (
    SELECT m.id,
        m.player_a,
        m.player_b,
        m.score_a,
        m.score_b,
        m.first_server,
        m.current_server,
        m.serves_left,
        m.status,
        m.p_s,
        m.p_r,
        m.ml_odds_a,
        m.spread_line,
        m.spread_odds,
        m.total_line,
        m.over_odds,
        m.under_odds,
        m.created_at,
        m.updated_at,
        CASE
            WHEN m.status = 'finished' THEN
                CASE WHEN m.score_a > m.score_b THEN 1.0 ELSE 0.0 END
            ELSE round(power(m.p_s, GREATEST(11 - m.score_a, 0)::numeric) * (1.0 - power(1.0 - m.p_r, GREATEST(11 - m.score_b, 0)::numeric)) / NULLIF(power(m.p_s, GREATEST(11 - m.score_a, 0)::numeric) * (1.0 - power(1.0 - m.p_r, GREATEST(11 - m.score_b, 0)::numeric)) + power(1.0 - m.p_s, GREATEST(11 - m.score_a, 0)::numeric) * power(m.p_r, GREATEST(11 - m.score_b, 0)::numeric), 0::numeric), 4)
        END AS win_prob_a,
        m.score_a + m.score_b AS total_points,
        CASE m.current_server WHEN 'A' THEN m.player_a ELSE m.player_b END AS next_server
    FROM tt_matches m
)
SELECT id AS match_id,
    player_a, player_b, score_a, score_b,
    next_server, serves_left, status, win_prob_a, total_points,
    p_s, p_r, ml_odds_a, spread_line, spread_odds, total_line, over_odds, under_odds,
    round(GREATEST(0::numeric, LEAST(1::numeric, win_prob_a + 0.05)), 4) AS cover_m15,
    round(GREATEST(0::numeric, LEAST(1::numeric, win_prob_a - 0.02)), 4) AS cover_m25,
    round(GREATEST(0::numeric, LEAST(1::numeric, win_prob_a - 0.08)), 4) AS cover_m35,
    round(GREATEST(0::numeric, LEAST(1::numeric, win_prob_a - 0.15)), 4) AS cover_m45,
    round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 16.5 THEN 1.0 ELSE 0.5 + (total_points::numeric - 10.0) / 20.0 END)), 4) AS over_165,
    round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 17.5 THEN 1.0 ELSE 0.45 + (total_points::numeric - 10.0) / 22.0 END)), 4) AS over_175,
    round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 18.5 THEN 1.0 ELSE 0.40 + (total_points::numeric - 10.0) / 25.0 END)), 4) AS over_185,
    round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 19.5 THEN 1.0 ELSE 0.35 + (total_points::numeric - 10.0) / 28.0 END)), 4) AS over_195,
    round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 20.5 THEN 1.0 ELSE 0.30 + (total_points::numeric - 10.0) / 30.0 END)), 4) AS over_205,
    CASE WHEN ml_odds_a IS NOT NULL THEN round(win_prob_a -
        CASE WHEN ml_odds_a < 0::numeric THEN abs(ml_odds_a) / (abs(ml_odds_a) + 100.0) ELSE 100.0 / (ml_odds_a + 100.0) END, 4)
        ELSE NULL::numeric END AS ml_edge,
    CASE WHEN spread_odds IS NOT NULL THEN round(GREATEST(0::numeric, LEAST(1::numeric, win_prob_a + 0.05)) -
        CASE WHEN spread_odds < 0::numeric THEN abs(spread_odds) / (abs(spread_odds) + 100.0) ELSE 100.0 / (spread_odds + 100.0) END, 4)
        ELSE NULL::numeric END AS spread_edge_m15,
    CASE WHEN over_odds IS NOT NULL THEN round(GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 18.5 THEN 1.0 ELSE 0.40 + (total_points::numeric - 10.0) / 25.0 END)) -
        CASE WHEN over_odds < 0::numeric THEN abs(over_odds) / (abs(over_odds) + 100.0) ELSE 100.0 / (over_odds + 100.0) END, 4)
        ELSE NULL::numeric END AS over_edge_185,
    CASE WHEN under_odds IS NOT NULL THEN round(1.0 - GREATEST(0::numeric, LEAST(1::numeric,
        CASE WHEN total_points::numeric >= 18.5 THEN 1.0 ELSE 0.40 + (total_points::numeric - 10.0) / 25.0 END)) -
        CASE WHEN under_odds < 0::numeric THEN abs(under_odds) / (abs(under_odds) + 100.0) ELSE 100.0 / (under_odds + 100.0) END, 4)
        ELSE NULL::numeric END AS under_edge_185,
    CASE
        WHEN ml_odds_a IS NOT NULL AND (win_prob_a - CASE WHEN ml_odds_a < 0::numeric THEN abs(ml_odds_a) / (abs(ml_odds_a) + 100.0) ELSE 100.0 / (ml_odds_a + 100.0) END) > 0.05 THEN 'ML A'
        WHEN spread_odds IS NOT NULL AND (GREATEST(0::numeric, LEAST(1::numeric, win_prob_a + 0.05)) - CASE WHEN spread_odds < 0::numeric THEN abs(spread_odds) / (abs(spread_odds) + 100.0) ELSE 100.0 / (spread_odds + 100.0) END) > 0.05 THEN 'SPREAD A -1.5'
        WHEN over_odds IS NOT NULL AND (GREATEST(0::numeric, LEAST(1::numeric, CASE WHEN total_points::numeric >= 18.5 THEN 1.0 ELSE 0.40 + (total_points::numeric - 10.0) / 25.0 END)) - CASE WHEN over_odds < 0::numeric THEN abs(over_odds) / (abs(over_odds) + 100.0) ELSE 100.0 / (over_odds + 100.0) END) > 0.05 THEN 'OVER 18.5'
        ELSE 'NONE'
    END AS best_bet_tag,
    created_at, updated_at
FROM match_data d;

-- Recreate tt_best_opportunities
CREATE OR REPLACE VIEW public.tt_best_opportunities AS
SELECT
  d.match_id, d.player_a, d.player_b, d.score_a, d.score_b,
  d.next_server, d.serves_left, d.status, d.win_prob_a, d.ml_edge,
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

-- Recreate tt_momentum_signal
CREATE OR REPLACE VIEW public.tt_momentum_signal AS
WITH recent_points AS (
  SELECT pl.match_id, pl.winner, pl.score_a_after, pl.score_b_after, pl.id,
    ROW_NUMBER() OVER (PARTITION BY pl.match_id ORDER BY pl.id DESC) AS rn
  FROM public.tt_point_log pl
),
last_few AS (
  SELECT match_id,
    COUNT(*) FILTER (WHERE winner = 'A' AND rn <= 5) AS a_last5,
    COUNT(*) FILTER (WHERE winner = 'B' AND rn <= 5) AS b_last5,
    COUNT(*) FILTER (WHERE rn <= 5) AS total_last5
  FROM recent_points WHERE rn <= 5 GROUP BY match_id
)
SELECT d.match_id, d.player_a, d.player_b, d.win_prob_a,
  CASE
    WHEN lf.a_last5 >= 4 THEN 'A_HOT'
    WHEN lf.b_last5 >= 4 THEN 'B_HOT'
    ELSE 'NEUTRAL'
  END AS momentum_level,
  ROUND((lf.a_last5::numeric / GREATEST(lf.total_last5, 1)) - 0.5, 3) AS win_prob_jump
FROM public.tt_admin_dashboard d
LEFT JOIN last_few lf ON lf.match_id = d.match_id
WHERE d.status = 'live';