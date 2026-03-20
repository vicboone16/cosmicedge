SET search_path TO public;

-- Parity repair: align drifted PBP objects with live-safe definitions
-- No destructive drops; CREATE OR REPLACE only to avoid dependency chain failures.

CREATE OR REPLACE VIEW public.v_game_possession_counts AS
SELECT
  game_id,
  max(league) AS league,
  count(*) FILTER (
    WHERE (event_type = ANY (ARRAY['made_shot','free_throw_made','rebound_defensive','turnover','foul_offensive','jump_ball']))
      OR (event_type = 'violation' AND possession_result = 'change_possession')
  ) AS estimated_possessions
FROM public.normalized_pbp_events e
GROUP BY game_id;

CREATE OR REPLACE VIEW public.v_latest_possession_signal AS
WITH possession_signals AS (
  SELECT
    e.game_id,
    e.id AS normalized_event_id,
    e.created_at,
    e.period_number,
    e.clock_display,
    e.clock_seconds_remaining,
    e.team_id,
    e.opponent_team_id,
    e.event_type,
    e.event_subtype,
    e.possession_result,
    e.possession_team_id_after,
    e.parser_confidence,
    CASE
      WHEN e.possession_result = 'change_possession' AND e.possession_team_id_after IS NOT NULL THEN e.possession_team_id_after
      WHEN e.possession_result = 'retain_possession' AND e.team_id IS NOT NULL THEN e.team_id
      ELSE NULL
    END AS inferred_possession_team_id,
    CASE
      WHEN e.possession_result = ANY (ARRAY['change_possession','retain_possession']) THEN COALESCE(e.parser_confidence, 0.75)
      ELSE NULL
    END AS possession_confidence_signal
  FROM public.normalized_pbp_events e
  WHERE e.possession_result = ANY (ARRAY['change_possession','retain_possession'])
), ranked AS (
  SELECT
    ps.game_id,
    ps.normalized_event_id,
    ps.created_at,
    ps.period_number,
    ps.clock_display,
    ps.clock_seconds_remaining,
    ps.team_id,
    ps.opponent_team_id,
    ps.event_type,
    ps.event_subtype,
    ps.possession_result,
    ps.possession_team_id_after,
    ps.parser_confidence,
    ps.inferred_possession_team_id,
    ps.possession_confidence_signal,
    row_number() OVER (
      PARTITION BY ps.game_id
      ORDER BY ps.period_number DESC NULLS LAST, ps.clock_seconds_remaining, ps.created_at DESC
    ) AS rn
  FROM possession_signals ps
)
SELECT
  game_id,
  normalized_event_id,
  created_at,
  period_number,
  clock_display,
  clock_seconds_remaining,
  event_type,
  event_subtype,
  inferred_possession_team_id AS possession_team_id,
  possession_confidence_signal AS possession_confidence
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW public.v_game_watch_debug AS
SELECT
  game_id,
  status,
  period_number,
  period_label,
  clock_display,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  possession_team_id,
  possession_confidence,
  last_event_id,
  last_event_type,
  last_event_subtype,
  last_event_player_name,
  last_event_text,
  event_zone,
  animation_key,
  sync_latency_ms,
  parser_version,
  source_provider,
  last_source_event_id,
  last_ingested_at,
  updated_at
FROM public.live_game_visual_state s;

CREATE OR REPLACE FUNCTION public.enqueue_visual_event(
  p_game_id text,
  p_normalized_event_id uuid,
  p_event_type text,
  p_event_subtype text DEFAULT NULL,
  p_team_id text DEFAULT NULL,
  p_primary_player_id text DEFAULT NULL,
  p_primary_player_name text DEFAULT NULL,
  p_clock_display text DEFAULT NULL,
  p_zone_key text DEFAULT NULL,
  p_animation_key text DEFAULT NULL,
  p_display_text text DEFAULT NULL,
  p_priority integer DEFAULT 100
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.visual_event_queue (
    game_id, normalized_event_id, event_type, event_subtype, team_id,
    primary_player_id, primary_player_name, clock_display, zone_key,
    animation_key, display_text, priority
  ) VALUES (
    p_game_id, p_normalized_event_id, p_event_type, p_event_subtype, p_team_id,
    p_primary_player_id, p_primary_player_name, p_clock_display, p_zone_key,
    p_animation_key, p_display_text, coalesce(p_priority,100)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_basketball_elapsed_seconds(
  p_league text,
  p_period_number integer,
  p_clock_seconds_remaining integer
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_elapsed numeric := 0;
  v_i int;
  v_period_minutes numeric;
BEGIN
  IF p_period_number IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_period_number > 1 THEN
    FOR v_i IN 1..(p_period_number - 1) LOOP
      v_elapsed := v_elapsed + (public.get_basketball_period_minutes(p_league, v_i) * 60);
    END LOOP;
  END IF;

  v_period_minutes := public.get_basketball_period_minutes(p_league, p_period_number);
  IF p_clock_seconds_remaining IS NULL THEN
    RETURN v_elapsed;
  END IF;

  v_elapsed := v_elapsed + greatest(0, (v_period_minutes * 60) - p_clock_seconds_remaining);
  RETURN v_elapsed;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_live_game_visual_state(
  p_game_id text,
  p_sport text DEFAULT NULL,
  p_league text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_home_team_id text DEFAULT NULL,
  p_away_team_id text DEFAULT NULL,
  p_period_number integer DEFAULT NULL,
  p_period_label text DEFAULT NULL,
  p_clock_display text DEFAULT NULL,
  p_clock_seconds_remaining integer DEFAULT NULL,
  p_home_score integer DEFAULT NULL,
  p_away_score integer DEFAULT NULL,
  p_possession_team_id text DEFAULT NULL,
  p_possession_confidence numeric DEFAULT NULL,
  p_last_event_id uuid DEFAULT NULL,
  p_last_event_type text DEFAULT NULL,
  p_last_event_subtype text DEFAULT NULL,
  p_last_event_team_id text DEFAULT NULL,
  p_last_event_player_id text DEFAULT NULL,
  p_last_event_player_name text DEFAULT NULL,
  p_last_event_text text DEFAULT NULL,
  p_last_event_points integer DEFAULT NULL,
  p_event_zone text DEFAULT NULL,
  p_animation_key text DEFAULT NULL,
  p_animation_status text DEFAULT NULL,
  p_momentum_team_id text DEFAULT NULL,
  p_momentum_score numeric DEFAULT NULL,
  p_recent_run_home integer DEFAULT NULL,
  p_recent_run_away integer DEFAULT NULL,
  p_recent_scoring_drought_home_sec integer DEFAULT NULL,
  p_recent_scoring_drought_away_sec integer DEFAULT NULL,
  p_pace_estimate numeric DEFAULT NULL,
  p_in_bonus_home boolean DEFAULT NULL,
  p_in_bonus_away boolean DEFAULT NULL,
  p_home_fouls_period integer DEFAULT NULL,
  p_away_fouls_period integer DEFAULT NULL,
  p_sync_latency_ms integer DEFAULT NULL,
  p_visual_mode_enabled boolean DEFAULT NULL,
  p_parser_version text DEFAULT NULL,
  p_source_provider text DEFAULT NULL,
  p_last_source_event_id text DEFAULT NULL,
  p_last_ingested_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.live_game_visual_state (
    game_id, sport, league, status, home_team_id, away_team_id,
    period_number, period_label, clock_display, clock_seconds_remaining,
    home_score, away_score, possession_team_id, possession_confidence,
    last_event_id, last_event_type, last_event_subtype, last_event_team_id,
    last_event_player_id, last_event_player_name, last_event_text, last_event_points,
    event_zone, animation_key, animation_status, momentum_team_id, momentum_score,
    recent_run_home, recent_run_away, recent_scoring_drought_home_sec,
    recent_scoring_drought_away_sec, pace_estimate, in_bonus_home, in_bonus_away,
    home_fouls_period, away_fouls_period, sync_latency_ms, visual_mode_enabled,
    parser_version, source_provider, last_source_event_id, last_ingested_at
  ) VALUES (
    p_game_id, p_sport, p_league, p_status, p_home_team_id, p_away_team_id,
    p_period_number, p_period_label, p_clock_display, p_clock_seconds_remaining,
    coalesce(p_home_score,0), coalesce(p_away_score,0), p_possession_team_id, p_possession_confidence,
    p_last_event_id, p_last_event_type, p_last_event_subtype, p_last_event_team_id,
    p_last_event_player_id, p_last_event_player_name, p_last_event_text, coalesce(p_last_event_points,0),
    p_event_zone, p_animation_key, p_animation_status, p_momentum_team_id, p_momentum_score,
    coalesce(p_recent_run_home,0), coalesce(p_recent_run_away,0), p_recent_scoring_drought_home_sec,
    p_recent_scoring_drought_away_sec, p_pace_estimate, coalesce(p_in_bonus_home,false), coalesce(p_in_bonus_away,false),
    coalesce(p_home_fouls_period,0), coalesce(p_away_fouls_period,0), p_sync_latency_ms, coalesce(p_visual_mode_enabled,true),
    p_parser_version, p_source_provider, p_last_source_event_id, coalesce(p_last_ingested_at, now())
  )
  ON CONFLICT (game_id) DO UPDATE SET
    sport = coalesce(EXCLUDED.sport, live_game_visual_state.sport),
    league = coalesce(EXCLUDED.league, live_game_visual_state.league),
    status = coalesce(EXCLUDED.status, live_game_visual_state.status),
    home_team_id = coalesce(EXCLUDED.home_team_id, live_game_visual_state.home_team_id),
    away_team_id = coalesce(EXCLUDED.away_team_id, live_game_visual_state.away_team_id),
    period_number = coalesce(EXCLUDED.period_number, live_game_visual_state.period_number),
    period_label = coalesce(EXCLUDED.period_label, live_game_visual_state.period_label),
    clock_display = coalesce(EXCLUDED.clock_display, live_game_visual_state.clock_display),
    clock_seconds_remaining = coalesce(EXCLUDED.clock_seconds_remaining, live_game_visual_state.clock_seconds_remaining),
    home_score = coalesce(EXCLUDED.home_score, live_game_visual_state.home_score),
    away_score = coalesce(EXCLUDED.away_score, live_game_visual_state.away_score),
    possession_team_id = coalesce(EXCLUDED.possession_team_id, live_game_visual_state.possession_team_id),
    possession_confidence = coalesce(EXCLUDED.possession_confidence, live_game_visual_state.possession_confidence),
    last_event_id = coalesce(EXCLUDED.last_event_id, live_game_visual_state.last_event_id),
    last_event_type = coalesce(EXCLUDED.last_event_type, live_game_visual_state.last_event_type),
    last_event_subtype = coalesce(EXCLUDED.last_event_subtype, live_game_visual_state.last_event_subtype),
    last_event_team_id = coalesce(EXCLUDED.last_event_team_id, live_game_visual_state.last_event_team_id),
    last_event_player_id = coalesce(EXCLUDED.last_event_player_id, live_game_visual_state.last_event_player_id),
    last_event_player_name = coalesce(EXCLUDED.last_event_player_name, live_game_visual_state.last_event_player_name),
    last_event_text = coalesce(EXCLUDED.last_event_text, live_game_visual_state.last_event_text),
    last_event_points = coalesce(EXCLUDED.last_event_points, live_game_visual_state.last_event_points),
    event_zone = coalesce(EXCLUDED.event_zone, live_game_visual_state.event_zone),
    animation_key = coalesce(EXCLUDED.animation_key, live_game_visual_state.animation_key),
    animation_status = coalesce(EXCLUDED.animation_status, live_game_visual_state.animation_status),
    momentum_team_id = coalesce(EXCLUDED.momentum_team_id, live_game_visual_state.momentum_team_id),
    momentum_score = coalesce(EXCLUDED.momentum_score, live_game_visual_state.momentum_score),
    recent_run_home = coalesce(EXCLUDED.recent_run_home, live_game_visual_state.recent_run_home),
    recent_run_away = coalesce(EXCLUDED.recent_run_away, live_game_visual_state.recent_run_away),
    recent_scoring_drought_home_sec = coalesce(EXCLUDED.recent_scoring_drought_home_sec, live_game_visual_state.recent_scoring_drought_home_sec),
    recent_scoring_drought_away_sec = coalesce(EXCLUDED.recent_scoring_drought_away_sec, live_game_visual_state.recent_scoring_drought_away_sec),
    pace_estimate = coalesce(EXCLUDED.pace_estimate, live_game_visual_state.pace_estimate),
    in_bonus_home = coalesce(EXCLUDED.in_bonus_home, live_game_visual_state.in_bonus_home),
    in_bonus_away = coalesce(EXCLUDED.in_bonus_away, live_game_visual_state.in_bonus_away),
    home_fouls_period = coalesce(EXCLUDED.home_fouls_period, live_game_visual_state.home_fouls_period),
    away_fouls_period = coalesce(EXCLUDED.away_fouls_period, live_game_visual_state.away_fouls_period),
    sync_latency_ms = coalesce(EXCLUDED.sync_latency_ms, live_game_visual_state.sync_latency_ms),
    visual_mode_enabled = coalesce(EXCLUDED.visual_mode_enabled, live_game_visual_state.visual_mode_enabled),
    parser_version = coalesce(EXCLUDED.parser_version, live_game_visual_state.parser_version),
    source_provider = coalesce(EXCLUDED.source_provider, live_game_visual_state.source_provider),
    last_source_event_id = coalesce(EXCLUDED.last_source_event_id, live_game_visual_state.last_source_event_id),
    last_ingested_at = coalesce(EXCLUDED.last_ingested_at, live_game_visual_state.last_ingested_at),
    updated_at = now();
END;
$$;