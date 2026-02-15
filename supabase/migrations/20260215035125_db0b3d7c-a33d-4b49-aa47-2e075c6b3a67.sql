
-- Fix security definer views by recreating with security_invoker = on
DROP VIEW IF EXISTS public.v_nfl_player_game_metrics;
DROP VIEW IF EXISTS public.v_nfl_player_quarter_metrics;

CREATE OR REPLACE VIEW public.v_nfl_player_game_metrics
WITH (security_invoker = on) AS
SELECT
  s.*,
  CASE WHEN s.receptions > 0 THEN ROUND(s.receiving_yards::numeric / s.receptions, 1) ELSE 0 END AS receiving_yards_per_reception,
  CASE WHEN s.targets > 0 THEN ROUND(s.receptions::numeric / s.targets * 100, 1) ELSE 0 END AS catch_percentage,
  CASE WHEN s.targets > 0 THEN ROUND(s.receiving_yards::numeric / s.targets, 1) ELSE 0 END AS receiving_yards_per_target,
  CASE WHEN s.rush_attempts > 0 THEN ROUND(s.rushing_yards::numeric / s.rush_attempts, 1) ELSE 0 END AS rushing_yards_per_attempt,
  (s.rushing_tds + s.receiving_tds) AS rush_rec_tds,
  (s.rushing_yards + s.receiving_yards) AS rush_rec_yards,
  g.season_year,
  g.week,
  g.home_team_name,
  g.away_team_name,
  g.game_time
FROM public.nfl_player_game_stats s
JOIN public.nfl_games g ON g.game_id = s.game_id;

CREATE OR REPLACE VIEW public.v_nfl_player_quarter_metrics
WITH (security_invoker = on) AS
SELECT
  pp.game_id,
  pp.quarter,
  ppl.player_id,
  ppl.player_name,
  pp.possession_abbr AS team_abbr,
  COUNT(*) AS total_plays,
  COUNT(*) FILTER (WHERE pp.is_scoring_play) AS scoring_plays,
  COUNT(*) FILTER (WHERE pp.is_touchdown) AS touchdowns
FROM public.nfl_play_by_play pp
JOIN public.nfl_play_by_play_players ppl ON pp.game_id = ppl.game_id AND pp.sequence = ppl.sequence
GROUP BY pp.game_id, pp.quarter, ppl.player_id, ppl.player_name, pp.possession_abbr;
