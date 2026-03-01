-- Drop dependent view first, then recreate both
DROP VIEW IF EXISTS public.np_v_backtest_results CASCADE;
DROP VIEW IF EXISTS public.np_player_prop_stat_long CASCADE;

-- Recreate np_player_prop_stat_long
CREATE OR REPLACE VIEW public.np_player_prop_stat_long AS
SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_points'::text AS prop_type,
    player_game_stats.points::numeric AS stat_value
   FROM player_game_stats
UNION ALL
 SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_rebounds'::text AS prop_type,
    player_game_stats.rebounds::numeric AS stat_value
   FROM player_game_stats
UNION ALL
 SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_assists'::text AS prop_type,
    player_game_stats.assists::numeric AS stat_value
   FROM player_game_stats;

-- Recreate np_v_backtest_results (depends on np_player_prop_stat_long)
CREATE OR REPLACE VIEW public.np_v_backtest_results AS
SELECT o.game_id,
    o.player_id,
    o.prop_type,
    o.book,
    o.side,
    o.pred_line,
    o.pred_odds,
    o.edge_score,
    o.confidence,
    o.pred_ts,
    o.closing_line,
    o.closing_odds,
    o.closing_ts,
    o.clv_line_diff,
    s.stat_value,
        CASE
            WHEN lower(o.side) = 'over'::text AND s.stat_value > o.pred_line THEN 1
            WHEN lower(o.side) = 'under'::text AND s.stat_value < o.pred_line THEN 1
            ELSE 0
        END AS win_flag
   FROM np_v_backtest_overlay o
     LEFT JOIN np_player_prop_stat_long s ON s.game_id = o.game_id AND s.player_id = o.player_id AND s.prop_type = o.prop_type;