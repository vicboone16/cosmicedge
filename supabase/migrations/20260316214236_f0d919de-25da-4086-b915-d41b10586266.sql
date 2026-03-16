
-- Phase 2 delta: add missing columns + new views + phase2 refresh function

-- 1) New columns not yet present
ALTER TABLE public.live_game_visual_state
  ADD COLUMN IF NOT EXISTS off_reb_last_5min_home int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS off_reb_last_5min_away int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS second_chance_pressure_team_id text,
  ADD COLUMN IF NOT EXISTS bonus_danger_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bonus_danger_away boolean NOT NULL DEFAULT false;

-- 2) Helper views
CREATE OR REPLACE VIEW public.v_pbp_fg_makes AS
SELECT e.id, e.game_id, e.period_number, e.clock_display, e.clock_seconds_remaining,
  e.sequence_number, e.event_index, e.team_id, e.event_type, e.event_subtype, e.points_scored, e.created_at
FROM public.normalized_pbp_events e WHERE e.event_type = 'made_shot';

CREATE OR REPLACE VIEW public.v_pbp_fg_misses AS
SELECT e.id, e.game_id, e.period_number, e.clock_display, e.clock_seconds_remaining,
  e.sequence_number, e.event_index, e.team_id, e.event_type, e.event_subtype, e.created_at
FROM public.normalized_pbp_events e WHERE e.event_type = 'missed_shot';

CREATE OR REPLACE VIEW public.v_pbp_offensive_rebounds AS
SELECT e.id, e.game_id, e.period_number, e.clock_display, e.clock_seconds_remaining,
  e.sequence_number, e.event_index, e.team_id, e.created_at
FROM public.normalized_pbp_events e WHERE e.event_type = 'rebound_offensive';

CREATE OR REPLACE VIEW public.v_pbp_team_foul_events AS
SELECT e.id, e.game_id, e.period_number, e.clock_display, e.clock_seconds_remaining,
  e.sequence_number, e.event_index, e.team_id, e.event_type, e.event_subtype, e.created_at
FROM public.normalized_pbp_events e
WHERE e.event_type IN ('foul_personal','foul_shooting','foul_offensive','foul_loose_ball','foul_technical');

-- 3) Confidence band helper
CREATE OR REPLACE FUNCTION public.get_confidence_band(p_conf numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_conf IS NULL THEN 'unknown'
    WHEN p_conf >= 0.90 THEN 'high'
    WHEN p_conf >= 0.70 THEN 'medium'
    WHEN p_conf >= 0.45 THEN 'low'
    ELSE 'very_low'
  END;
$$;

-- 4) Phase 2 refresh function
CREATE OR REPLACE FUNCTION public.refresh_live_game_phase2_metrics(p_game_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_home text; v_away text; v_period int; v_clock int;
  v_fg_lhc int; v_fg_lac int; v_fg_dh int; v_fg_da int;
  v_ep_h int := 0; v_ep_a int := 0;
  v_orh int := 0; v_ora int := 0; v_scp text;
  v_fh int := 0; v_fa int := 0;
  v_bdh bool := false; v_bda bool := false;
BEGIN
  SELECT home_team_id, away_team_id, period_number, clock_seconds_remaining
  INTO v_home, v_away, v_period, v_clock
  FROM public.live_game_visual_state WHERE game_id = p_game_id;
  IF v_home IS NULL AND v_away IS NULL THEN RETURN; END IF;

  -- A) FG DROUGHT
  SELECT clock_seconds_remaining INTO v_fg_lhc FROM public.v_pbp_fg_makes
  WHERE game_id=p_game_id AND team_id=v_home
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  SELECT clock_seconds_remaining INTO v_fg_lac FROM public.v_pbp_fg_makes
  WHERE game_id=p_game_id AND team_id=v_away
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  IF v_fg_lhc IS NOT NULL AND v_clock IS NOT NULL THEN v_fg_dh := GREATEST(v_fg_lhc - v_clock, 0); END IF;
  IF v_fg_lac IS NOT NULL AND v_clock IS NOT NULL THEN v_fg_da := GREATEST(v_fg_lac - v_clock, 0); END IF;

  -- B) EMPTY POSSESSIONS (last 5 possession-ending events with 0 pts)
  SELECT COUNT(*) INTO v_ep_h FROM (
    SELECT 1 FROM public.normalized_pbp_events e
    WHERE e.game_id=p_game_id AND e.team_id=v_home
      AND public.is_empty_possession_event(e.event_type, e.points_scored)
    ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
    LIMIT 5
  ) x;
  SELECT COUNT(*) INTO v_ep_a FROM (
    SELECT 1 FROM public.normalized_pbp_events e
    WHERE e.game_id=p_game_id AND e.team_id=v_away
      AND public.is_empty_possession_event(e.event_type, e.points_scored)
    ORDER BY e.period_number DESC, e.sequence_number DESC NULLS LAST, e.event_index DESC NULLS LAST, e.created_at DESC
    LIMIT 5
  ) x;

  -- C) OREB PRESSURE (last 5 game minutes in current period)
  SELECT COUNT(*) INTO v_orh FROM public.v_pbp_offensive_rebounds
  WHERE game_id=p_game_id AND period_number=v_period AND team_id=v_home
    AND clock_seconds_remaining BETWEEN GREATEST(v_clock,0) AND LEAST(COALESCE(v_clock,0)+300,720);
  SELECT COUNT(*) INTO v_ora FROM public.v_pbp_offensive_rebounds
  WHERE game_id=p_game_id AND period_number=v_period AND team_id=v_away
    AND clock_seconds_remaining BETWEEN GREATEST(v_clock,0) AND LEAST(COALESCE(v_clock,0)+300,720);
  IF v_orh > v_ora AND v_orh >= 2 THEN v_scp := v_home;
  ELSIF v_ora > v_orh AND v_ora >= 2 THEN v_scp := v_away;
  ELSE v_scp := NULL; END IF;

  -- D) BONUS DANGER (4+ fouls in period)
  SELECT COUNT(*) INTO v_fh FROM public.v_pbp_team_foul_events
  WHERE game_id=p_game_id AND period_number=v_period AND team_id=v_home;
  SELECT COUNT(*) INTO v_fa FROM public.v_pbp_team_foul_events
  WHERE game_id=p_game_id AND period_number=v_period AND team_id=v_away;
  v_bdh := COALESCE(v_fh,0) >= 4;
  v_bda := COALESCE(v_fa,0) >= 4;

  -- E) WRITE BACK
  UPDATE public.live_game_visual_state SET
    fg_drought_home_sec = v_fg_dh, fg_drought_away_sec = v_fg_da,
    empty_possessions_home = COALESCE(v_ep_h,0), empty_possessions_away = COALESCE(v_ep_a,0),
    off_reb_last_5min_home = COALESCE(v_orh,0), off_reb_last_5min_away = COALESCE(v_ora,0),
    second_chance_pressure_team_id = v_scp,
    home_fouls_period = COALESCE(v_fh,0), away_fouls_period = COALESCE(v_fa,0),
    bonus_danger_home = v_bdh, bonus_danger_away = v_bda,
    updated_at = now()
  WHERE game_id = p_game_id;
END;
$$;

-- 5) Combined trigger calls both functions
CREATE OR REPLACE FUNCTION public.after_normalized_pbp_event_refresh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.refresh_live_game_derived_metrics(new.game_id);
  PERFORM public.refresh_live_game_phase2_metrics(new.game_id);
  RETURN new;
END;
$$;

-- 6) Recreate trigger
DROP TRIGGER IF EXISTS trg_after_normalized_pbp_event_refresh ON public.normalized_pbp_events;
CREATE TRIGGER trg_after_normalized_pbp_event_refresh
  AFTER INSERT ON public.normalized_pbp_events
  FOR EACH ROW EXECUTE FUNCTION public.after_normalized_pbp_event_refresh();

-- 7) Richer insights view
DROP VIEW IF EXISTS public.v_game_watch_insights CASCADE;
CREATE VIEW public.v_game_watch_insights AS
SELECT
  s.game_id, s.home_team_id, s.away_team_id,
  s.period_number, s.period_label, s.clock_display,
  s.home_score, s.away_score,
  s.possession_team_id, s.possession_confidence,
  public.get_confidence_band(s.possession_confidence) AS possession_confidence_band,
  s.recent_run_home, s.recent_run_away,
  s.recent_scoring_drought_home_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_home_sec) AS drought_home_mmss,
  s.recent_scoring_drought_away_sec,
  public.format_seconds_mmss(s.recent_scoring_drought_away_sec) AS drought_away_mmss,
  s.fg_drought_home_sec,
  public.format_seconds_mmss(s.fg_drought_home_sec) AS fg_drought_home_mmss,
  s.fg_drought_away_sec,
  public.format_seconds_mmss(s.fg_drought_away_sec) AS fg_drought_away_mmss,
  s.empty_possessions_home, s.empty_possessions_away,
  s.off_reb_last_5min_home, s.off_reb_last_5min_away, s.second_chance_pressure_team_id,
  s.home_fouls_period, s.away_fouls_period,
  s.bonus_danger_home, s.bonus_danger_away, s.bonus_danger_team_id,
  s.in_bonus_home, s.in_bonus_away,
  s.pace_estimate, public.get_pace_band(s.pace_estimate) AS pace_band,
  s.momentum_team_id, s.momentum_score,
  public.get_momentum_band(s.momentum_score) AS momentum_band,
  s.last_event_type, s.last_event_subtype, s.last_event_text,
  s.event_zone, s.animation_key, s.updated_at
FROM public.live_game_visual_state s;
