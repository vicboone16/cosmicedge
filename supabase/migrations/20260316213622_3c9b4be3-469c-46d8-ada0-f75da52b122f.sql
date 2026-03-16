
-- =========================================
-- MAIN DERIVATION FUNCTION
-- =========================================
CREATE OR REPLACE FUNCTION public.refresh_live_game_derived_metrics(p_game_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_home_team_id text;
  v_away_team_id text;
  v_period_number int;
  v_clock_seconds_remaining int;
  v_last_event_type text;
  v_last_event_subtype text;
  v_last_event_team_id text;
  v_possession_team_id text;
  v_recent_run_home int := 0;
  v_recent_run_away int := 0;
  v_last_home_score_clock int;
  v_last_home_score_period int;
  v_last_away_score_clock int;
  v_last_away_score_period int;
  v_drought_home int;
  v_drought_away int;
  v_elapsed_game_seconds numeric := 0;
  v_total_possession_ends int := 0;
  v_pace_estimate numeric;
  v_possession_confidence numeric := 0.35;
  v_momentum_team_id text;
  v_momentum_score numeric := 0;
BEGIN
  SELECT home_team_id, away_team_id, period_number, clock_seconds_remaining,
         last_event_type, last_event_subtype, last_event_team_id, possession_team_id
  INTO v_home_team_id, v_away_team_id, v_period_number, v_clock_seconds_remaining,
       v_last_event_type, v_last_event_subtype, v_last_event_team_id, v_possession_team_id
  FROM public.live_game_visual_state WHERE game_id = p_game_id;

  IF v_home_team_id IS NULL AND v_away_team_id IS NULL THEN RETURN; END IF;

  -- 1) RECENT RUN (last 180 game seconds in current period)
  SELECT
    COALESCE(SUM(CASE WHEN e.team_id = v_home_team_id THEN e.points_scored ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.team_id = v_away_team_id THEN e.points_scored ELSE 0 END), 0)
  INTO v_recent_run_home, v_recent_run_away
  FROM public.v_pbp_scoring_events e
  WHERE e.game_id = p_game_id
    AND e.period_number = v_period_number
    AND e.clock_seconds_remaining BETWEEN GREATEST(v_clock_seconds_remaining, 0) AND LEAST(COALESCE(v_clock_seconds_remaining,0) + 180, 720);

  -- Fallback: last 8 scoring plays
  IF COALESCE(v_recent_run_home, 0) = 0 AND COALESCE(v_recent_run_away, 0) = 0 THEN
    SELECT
      COALESCE(SUM(CASE WHEN x.team_id = v_home_team_id THEN x.points_scored ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN x.team_id = v_away_team_id THEN x.points_scored ELSE 0 END), 0)
    INTO v_recent_run_home, v_recent_run_away
    FROM (
      SELECT * FROM public.v_pbp_scoring_events e
      WHERE e.game_id = p_game_id
      ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
      LIMIT 8
    ) x;
  END IF;

  -- 2) DROUGHT (cross-period safe)
  SELECT e.clock_seconds_remaining, e.period_number
  INTO v_last_home_score_clock, v_last_home_score_period
  FROM public.v_pbp_scoring_events e
  WHERE e.game_id = p_game_id AND e.team_id = v_home_team_id
  ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  SELECT e.clock_seconds_remaining, e.period_number
  INTO v_last_away_score_clock, v_last_away_score_period
  FROM public.v_pbp_scoring_events e
  WHERE e.game_id = p_game_id AND e.team_id = v_away_team_id
  ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
  LIMIT 1;

  v_drought_home := public.calc_drought_seconds(v_last_home_score_period, v_last_home_score_clock, v_period_number, v_clock_seconds_remaining);
  v_drought_away := public.calc_drought_seconds(v_last_away_score_period, v_last_away_score_clock, v_period_number, v_clock_seconds_remaining);

  -- 3) PACE
  IF v_period_number IS NOT NULL AND v_clock_seconds_remaining IS NOT NULL THEN
    v_elapsed_game_seconds := public.get_elapsed_game_seconds(v_period_number, v_clock_seconds_remaining);
  END IF;

  SELECT COALESCE(SUM(possession_end_flag), 0) INTO v_total_possession_ends
  FROM public.v_pbp_possession_end_events e WHERE e.game_id = p_game_id;

  IF v_elapsed_game_seconds > 0 THEN
    v_pace_estimate := ROUND(((v_total_possession_ends::numeric / (v_elapsed_game_seconds / 60.0)) * 48.0), 1);
  END IF;

  -- 4) POSSESSION CONFIDENCE
  v_possession_confidence := CASE
    WHEN v_last_event_type IN ('rebound_defensive','turnover','steal','made_shot','jump_ball','foul_offensive') THEN 0.92
    WHEN v_last_event_type = 'rebound_offensive' THEN 0.88
    WHEN v_last_event_type IN ('timeout','substitution') AND v_possession_team_id IS NOT NULL THEN 0.76
    WHEN v_last_event_type IN ('foul_shooting','foul_personal','free_throw_made','free_throw_missed') THEN 0.55
    WHEN v_last_event_type = 'unknown' THEN 0.25
    ELSE 0.40
  END;

  -- 5) MOMENTUM
  v_momentum_score := COALESCE(v_recent_run_home, 0) - COALESCE(v_recent_run_away, 0);

  IF v_last_event_type IN ('made_shot','free_throw_made') THEN
    IF v_last_event_team_id = v_home_team_id THEN v_momentum_score := v_momentum_score + 0.75;
    ELSIF v_last_event_team_id = v_away_team_id THEN v_momentum_score := v_momentum_score - 0.75;
    END IF;
  END IF;

  IF v_possession_team_id = v_home_team_id THEN v_momentum_score := v_momentum_score + 0.25;
  ELSIF v_possession_team_id = v_away_team_id THEN v_momentum_score := v_momentum_score - 0.25;
  END IF;

  v_momentum_team_id := CASE
    WHEN v_momentum_score > 0 THEN v_home_team_id
    WHEN v_momentum_score < 0 THEN v_away_team_id
    ELSE NULL
  END;

  -- UPDATE
  UPDATE public.live_game_visual_state SET
    possession_confidence = v_possession_confidence,
    recent_run_home = COALESCE(v_recent_run_home, 0),
    recent_run_away = COALESCE(v_recent_run_away, 0),
    recent_scoring_drought_home_sec = v_drought_home,
    recent_scoring_drought_away_sec = v_drought_away,
    pace_estimate = v_pace_estimate,
    momentum_team_id = v_momentum_team_id,
    momentum_score = v_momentum_score,
    updated_at = now()
  WHERE game_id = p_game_id;
END;
$$;

-- =========================================
-- TRIGGER: Auto-refresh after new PBP event
-- =========================================
CREATE OR REPLACE FUNCTION public.after_normalized_pbp_event_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.refresh_live_game_derived_metrics(NEW.game_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_normalized_pbp_event_refresh ON public.normalized_pbp_events;
CREATE TRIGGER trg_after_normalized_pbp_event_refresh
  AFTER INSERT ON public.normalized_pbp_events
  FOR EACH ROW EXECUTE FUNCTION public.after_normalized_pbp_event_refresh();

-- =========================================
-- CURRENT RUN FUNCTION (V1.5)
-- =========================================
CREATE OR REPLACE FUNCTION public.get_current_run_for_game(p_game_id text)
RETURNS TABLE (home_run_points int, away_run_points int) LANGUAGE plpgsql AS $$
DECLARE
  v_home_team_id text;
  v_away_team_id text;
BEGIN
  SELECT home_team_id, away_team_id INTO v_home_team_id, v_away_team_id
  FROM public.live_game_visual_state WHERE game_id = p_game_id;

  RETURN QUERY
  WITH scoring AS (
    SELECT e.*, ROW_NUMBER() OVER (
      ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
    ) AS rn_desc
    FROM public.v_pbp_scoring_events e WHERE e.game_id = p_game_id
  ),
  last_scores AS (
    SELECT
      MAX(CASE WHEN team_id = v_home_team_id THEN rn_desc END) AS last_home_score_rn,
      MAX(CASE WHEN team_id = v_away_team_id THEN rn_desc END) AS last_away_score_rn
    FROM scoring
  )
  SELECT
    COALESCE((SELECT SUM(s.points_scored)::int FROM scoring s, last_scores ls
      WHERE s.team_id = v_home_team_id AND s.rn_desc <= COALESCE(ls.last_away_score_rn, 999999)), 0),
    COALESCE((SELECT SUM(s.points_scored)::int FROM scoring s, last_scores ls
      WHERE s.team_id = v_away_team_id AND s.rn_desc <= COALESCE(ls.last_home_score_rn, 999999)), 0);
END;
$$;

-- =========================================
-- ADMIN VIEWS
-- =========================================
CREATE OR REPLACE VIEW public.v_game_watch_insights AS
SELECT
  s.game_id, s.home_team_id, s.away_team_id,
  s.period_number, s.clock_display, s.home_score, s.away_score,
  s.possession_team_id, s.possession_confidence,
  s.recent_run_home, s.recent_run_away,
  s.recent_scoring_drought_home_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_home_sec) AS drought_home_mmss,
  s.recent_scoring_drought_away_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_away_sec) AS drought_away_mmss,
  s.pace_estimate, public.get_pace_band(s.pace_estimate) AS pace_band,
  s.momentum_team_id, s.momentum_score, s.updated_at
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
