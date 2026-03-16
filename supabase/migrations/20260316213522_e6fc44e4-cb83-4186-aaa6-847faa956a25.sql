
-- =========================================
-- HELPER VIEWS
-- =========================================

CREATE OR REPLACE VIEW public.v_pbp_scoring_events AS
SELECT
  e.id, e.game_id, e.period_number, e.clock_display,
  e.clock_seconds_remaining, e.sequence_number, e.event_index,
  e.team_id, e.points_scored, e.event_type, e.event_subtype, e.created_at
FROM public.normalized_pbp_events e
WHERE e.is_scoring_play = true AND e.points_scored > 0;

CREATE OR REPLACE VIEW public.v_pbp_possession_change_events AS
SELECT
  e.id, e.game_id, e.period_number, e.clock_display,
  e.clock_seconds_remaining, e.sequence_number, e.event_index,
  e.team_id, e.opponent_team_id, e.possession_result,
  e.event_type, e.event_subtype, e.created_at
FROM public.normalized_pbp_events e
WHERE e.possession_result IN ('change_possession', 'retain_possession');

CREATE OR REPLACE VIEW public.v_pbp_possession_end_events AS
SELECT
  e.id, e.game_id, e.period_number,
  e.clock_seconds_remaining, e.sequence_number, e.event_index,
  e.team_id, e.opponent_team_id, e.event_type, e.event_subtype,
  CASE
    WHEN e.event_type IN ('made_shot','rebound_defensive','turnover','foul_offensive') THEN 1
    WHEN e.event_type = 'violation' AND e.possession_result = 'change_possession' THEN 1
    WHEN e.event_type = 'jump_ball' AND e.possession_result = 'change_possession' THEN 1
    ELSE 0
  END AS possession_end_flag
FROM public.normalized_pbp_events e
WHERE e.event_type IN ('made_shot','rebound_defensive','turnover','foul_offensive','violation','jump_ball');

-- =========================================
-- HELPER FUNCTIONS
-- =========================================

CREATE OR REPLACE FUNCTION public.get_pace_band(p_pace numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_pace IS NULL THEN 'unknown'
    WHEN p_pace < 92 THEN 'slow'
    WHEN p_pace < 99 THEN 'neutral'
    WHEN p_pace < 104 THEN 'fast'
    ELSE 'blazing'
  END;
$$;

CREATE OR REPLACE FUNCTION public.format_seconds_mmss(p_seconds int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad(((COALESCE(p_seconds,0)/60)::int)::text,2,'0')
    || ':' || lpad((COALESCE(p_seconds,0)%60)::text,2,'0');
$$;

CREATE OR REPLACE FUNCTION public.get_elapsed_game_seconds(p_period int, p_clock_remaining int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_period <= 4 THEN ((p_period-1)*720)+(720-p_clock_remaining)
    ELSE (4*720)+((p_period-5)*300)+(300-p_clock_remaining)
  END;
$$;

CREATE OR REPLACE FUNCTION public.calc_drought_seconds(
  p_last_period int, p_last_clock int, p_current_period int, p_current_clock int
) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_last_period = p_current_period THEN GREATEST(p_last_clock - p_current_clock, 0)
    WHEN p_last_period < p_current_period THEN
      p_last_clock + ((p_current_period - p_last_period - 1) * 720) + (720 - p_current_clock)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_possession_end_event(p_event_type text, p_event_subtype text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_event_type IN ('made_shot','turnover','rebound_defensive','foul_offensive','violation','jump_ball');
$$;

CREATE OR REPLACE FUNCTION public.is_empty_possession_event(p_event_type text, p_points int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.is_possession_end_event(p_event_type, NULL) AND COALESCE(p_points, 0) = 0;
$$;

CREATE OR REPLACE FUNCTION public.validate_event_type(p_event_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_event_type IN (
      'made_shot','missed_shot','free_throw_made','free_throw_missed',
      'rebound_offensive','rebound_defensive','turnover','steal','block',
      'foul_personal','foul_shooting','foul_offensive','foul_loose_ball','foul_technical',
      'jump_ball','violation','timeout','substitution'
    ) THEN p_event_type
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_visual_event_queue()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.visual_event_queue WHERE created_at < now() - interval '4 hours';
$$;

CREATE OR REPLACE FUNCTION public.trim_visual_event_queue(p_game_id text)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.visual_event_queue
  WHERE game_id = p_game_id
    AND id NOT IN (
      SELECT id FROM public.visual_event_queue
      WHERE game_id = p_game_id ORDER BY created_at DESC LIMIT 100
    );
$$;
