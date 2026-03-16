
-- Phase 2: Add columns for empty possessions, FG drought, oreb pressure, bonus danger
ALTER TABLE public.live_game_visual_state
  ADD COLUMN IF NOT EXISTS empty_possessions_home int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empty_possessions_away int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empty_poss_home_last_n int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empty_poss_away_last_n int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fg_drought_home_sec int,
  ADD COLUMN IF NOT EXISTS fg_drought_away_sec int,
  ADD COLUMN IF NOT EXISTS oreb_home_period int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oreb_away_period int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oreb_pressure_team_id text,
  ADD COLUMN IF NOT EXISTS bonus_danger_team_id text;

-- Momentum band helper
CREATE OR REPLACE FUNCTION public.get_momentum_band(p_momentum_score numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_momentum_score IS NULL THEN 'neutral'
    WHEN p_momentum_score >= 4 THEN 'strong_home_edge'
    WHEN p_momentum_score >= 1 THEN 'slight_home_edge'
    WHEN p_momentum_score <= -4 THEN 'strong_away_edge'
    WHEN p_momentum_score <= -1 THEN 'slight_away_edge'
    ELSE 'neutral'
  END;
$$;

-- FG scoring events view (excludes free throws)
CREATE OR REPLACE VIEW public.v_pbp_fg_scoring_events AS
SELECT
  e.id, e.game_id, e.period_number, e.clock_display,
  e.clock_seconds_remaining, e.sequence_number, e.event_index,
  e.team_id, e.points_scored, e.event_type, e.event_subtype, e.created_at
FROM public.normalized_pbp_events e
WHERE e.event_type = 'made_shot' AND e.points_scored > 0;
