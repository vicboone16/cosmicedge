
-- Drop and recreate with correct column order
DROP VIEW IF EXISTS public.v_game_watch_insights CASCADE;
DROP VIEW IF EXISTS public.v_game_watch_validation CASCADE;

CREATE OR REPLACE VIEW public.v_game_watch_insights AS
SELECT
  s.game_id, s.home_team_id, s.away_team_id,
  s.period_number, s.clock_display, s.period_label,
  s.home_score, s.away_score,
  s.possession_team_id, s.possession_confidence,
  s.recent_run_home, s.recent_run_away,
  s.recent_scoring_drought_home_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_home_sec) AS drought_home_mmss,
  s.recent_scoring_drought_away_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_away_sec) AS drought_away_mmss,
  s.fg_drought_home_sec,
  public.format_seconds_mmss(s.fg_drought_home_sec) AS fg_drought_home_mmss,
  s.fg_drought_away_sec,
  public.format_seconds_mmss(s.fg_drought_away_sec) AS fg_drought_away_mmss,
  s.pace_estimate, public.get_pace_band(s.pace_estimate) AS pace_band,
  s.momentum_team_id, s.momentum_score,
  public.get_momentum_band(s.momentum_score) AS momentum_band,
  s.empty_possessions_home, s.empty_possessions_away,
  s.empty_poss_home_last_n, s.empty_poss_away_last_n,
  s.oreb_home_period, s.oreb_away_period, s.oreb_pressure_team_id,
  s.home_fouls_period, s.away_fouls_period,
  s.in_bonus_home, s.in_bonus_away, s.bonus_danger_team_id,
  s.last_event_type, s.last_event_subtype, s.last_event_text,
  s.event_zone, s.animation_key, s.updated_at
FROM public.live_game_visual_state s;

CREATE OR REPLACE VIEW public.v_game_watch_validation AS
SELECT
  g.game_id, g.home_team_id, g.away_team_id,
  COUNT(e.id) AS total_events,
  SUM(CASE WHEN e.is_scoring_play THEN 1 ELSE 0 END) AS scoring_events,
  SUM(CASE WHEN e.event_type = 'turnover' THEN 1 ELSE 0 END) AS turnovers,
  SUM(CASE WHEN e.event_type = 'rebound_offensive' THEN 1 ELSE 0 END) AS offensive_rebounds,
  SUM(CASE WHEN e.event_type = 'rebound_defensive' THEN 1 ELSE 0 END) AS defensive_rebounds,
  MAX(e.period_number) AS last_period,
  MAX(e.created_at) AS last_event_time
FROM public.normalized_pbp_events e
JOIN public.live_game_visual_state g ON g.game_id = e.game_id
GROUP BY g.game_id, g.home_team_id, g.away_team_id;
