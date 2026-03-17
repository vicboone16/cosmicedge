
-- ═══════════════════════════════════════════════════════════
-- Watch Mode Derived Metrics SQL Layer (V1)
-- ═══════════════════════════════════════════════════════════

-- 1) Add missing columns to normalized_pbp_events
ALTER TABLE public.normalized_pbp_events
  ADD COLUMN IF NOT EXISTS home_team_id text,
  ADD COLUMN IF NOT EXISTS away_team_id text,
  ADD COLUMN IF NOT EXISTS possession_team_id_after text;

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_clock
  ON public.normalized_pbp_events (game_id, period_number, clock_seconds_remaining, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_scoring
  ON public.normalized_pbp_events (game_id, is_scoring_play, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_team_scoring
  ON public.normalized_pbp_events (game_id, team_id, is_scoring_play, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_possession
  ON public.normalized_pbp_events (game_id, possession_result, created_at DESC);

-- 3) Period length helper
CREATE OR REPLACE FUNCTION public.get_basketball_period_minutes(p_league text, p_period_number int)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF upper(coalesce(p_league, '')) IN ('NBA', 'WNBA') THEN
    IF coalesce(p_period_number, 1) <= 4 THEN RETURN 12; ELSE RETURN 5; END IF;
  END IF;
  IF upper(coalesce(p_league, '')) IN ('NCAAB', 'NCAAW') THEN
    IF coalesce(p_period_number, 1) <= 2 THEN RETURN 20; ELSE RETURN 5; END IF;
  END IF;
  IF coalesce(p_period_number, 1) <= 4 THEN RETURN 12; END IF;
  RETURN 5;
END; $$;

-- 4) Total elapsed game seconds helper
CREATE OR REPLACE FUNCTION public.get_basketball_elapsed_seconds(p_league text, p_period_number int, p_clock_seconds_remaining int)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_elapsed numeric := 0; v_i int; v_period_minutes numeric;
BEGIN
  IF p_period_number IS NULL THEN RETURN NULL; END IF;
  IF p_period_number > 1 THEN
    FOR v_i IN 1..(p_period_number - 1) LOOP
      v_elapsed := v_elapsed + (public.get_basketball_period_minutes(p_league, v_i) * 60);
    END LOOP;
  END IF;
  v_period_minutes := public.get_basketball_period_minutes(p_league, p_period_number);
  IF p_clock_seconds_remaining IS NULL THEN RETURN v_elapsed; END IF;
  v_elapsed := v_elapsed + greatest(0, (v_period_minutes * 60) - p_clock_seconds_remaining);
  RETURN v_elapsed;
END; $$;

-- 5) Possession signal view
CREATE OR REPLACE VIEW public.v_latest_possession_signal AS
WITH possession_signals AS (
  SELECT e.game_id, e.id AS normalized_event_id, e.created_at, e.period_number,
    e.clock_display, e.clock_seconds_remaining, e.team_id, e.opponent_team_id,
    e.event_type, e.event_subtype, e.possession_result, e.possession_team_id_after, e.parser_confidence,
    CASE
      WHEN e.possession_result = 'change_possession' AND e.possession_team_id_after IS NOT NULL THEN e.possession_team_id_after
      WHEN e.possession_result = 'retain_possession' AND e.team_id IS NOT NULL THEN e.team_id
      ELSE NULL
    END AS inferred_possession_team_id,
    CASE WHEN e.possession_result IN ('change_possession', 'retain_possession') THEN coalesce(e.parser_confidence, 0.75) ELSE NULL END AS possession_confidence_signal
  FROM public.normalized_pbp_events e
  WHERE e.possession_result IN ('change_possession', 'retain_possession')
),
ranked AS (
  SELECT ps.*, row_number() OVER (PARTITION BY ps.game_id ORDER BY ps.period_number DESC NULLS LAST, ps.clock_seconds_remaining ASC NULLS LAST, ps.created_at DESC) AS rn
  FROM possession_signals ps
)
SELECT game_id, normalized_event_id, created_at, period_number, clock_display, clock_seconds_remaining,
  event_type, event_subtype, inferred_possession_team_id AS possession_team_id, possession_confidence_signal AS possession_confidence
FROM ranked WHERE rn = 1;

-- 6) Possession count view
CREATE OR REPLACE VIEW public.v_game_possession_counts AS
SELECT e.game_id, max(e.league) AS league,
  count(*) FILTER (WHERE e.event_type = 'made_shot' OR (e.event_type = 'free_throw_made' AND e.event_subtype = 'final_ft')
    OR e.event_type = 'rebound_defensive' OR e.event_type = 'turnover' OR e.event_type = 'foul_offensive'
    OR (e.event_type = 'violation' AND e.possession_result = 'change_possession') OR e.event_type = 'jump_ball'
  ) AS estimated_possessions
FROM public.normalized_pbp_events e GROUP BY e.game_id;

-- 7) Elapsed time view
CREATE OR REPLACE VIEW public.v_game_elapsed_time AS
WITH latest_clock AS (
  SELECT DISTINCT ON (e.game_id) e.game_id, e.league, e.period_number, e.clock_display, e.clock_seconds_remaining, e.created_at
  FROM public.normalized_pbp_events e ORDER BY e.game_id, e.created_at DESC
)
SELECT lc.game_id, lc.league, lc.period_number, lc.clock_display, lc.clock_seconds_remaining,
  public.get_basketball_elapsed_seconds(lc.league, lc.period_number, lc.clock_seconds_remaining) AS elapsed_seconds
FROM latest_clock lc;

-- 8) Live pace view
CREATE OR REPLACE VIEW public.v_game_live_pace AS
SELECT pc.game_id, pc.league, pc.estimated_possessions, et.elapsed_seconds,
  CASE WHEN et.elapsed_seconds IS NULL OR et.elapsed_seconds <= 0 THEN NULL
    ELSE round(((pc.estimated_possessions::numeric / et.elapsed_seconds::numeric) * 2880)::numeric, 3)
  END AS live_pace_48
FROM public.v_game_possession_counts pc
LEFT JOIN public.v_game_elapsed_time et ON et.game_id = pc.game_id;

-- 9) Recent scoring runs (120s window)
CREATE OR REPLACE VIEW public.v_game_recent_runs AS
WITH latest_time AS (
  SELECT et.game_id, et.elapsed_seconds AS current_elapsed_seconds FROM public.v_game_elapsed_time et
),
scoring_events AS (
  SELECT e.game_id, e.team_id, e.home_team_id, e.away_team_id, e.points_scored,
    public.get_basketball_elapsed_seconds(e.league, e.period_number, e.clock_seconds_remaining) AS event_elapsed_seconds
  FROM public.normalized_pbp_events e WHERE e.is_scoring_play = true AND coalesce(e.points_scored, 0) > 0
),
windowed AS (
  SELECT se.game_id, se.team_id, se.home_team_id, se.away_team_id, sum(se.points_scored) AS team_run_points
  FROM scoring_events se JOIN latest_time lt ON lt.game_id = se.game_id
  WHERE se.event_elapsed_seconds IS NOT NULL AND lt.current_elapsed_seconds IS NOT NULL
    AND se.event_elapsed_seconds >= greatest(0, lt.current_elapsed_seconds - 120)
  GROUP BY se.game_id, se.team_id, se.home_team_id, se.away_team_id
)
SELECT g.game_id,
  max(CASE WHEN w.team_id = w.home_team_id THEN w.team_run_points END) AS recent_run_home,
  max(CASE WHEN w.team_id = w.away_team_id THEN w.team_run_points END) AS recent_run_away
FROM (SELECT DISTINCT game_id FROM public.normalized_pbp_events) g
LEFT JOIN windowed w ON w.game_id = g.game_id GROUP BY g.game_id;

-- 10) Scoring droughts
CREATE OR REPLACE VIEW public.v_game_scoring_droughts AS
WITH latest_time AS (
  SELECT et.game_id, et.elapsed_seconds AS current_elapsed_seconds FROM public.v_game_elapsed_time et
),
last_scores AS (
  SELECT e.game_id, e.team_id, e.home_team_id, e.away_team_id,
    max(public.get_basketball_elapsed_seconds(e.league, e.period_number, e.clock_seconds_remaining)) AS last_score_elapsed_seconds
  FROM public.normalized_pbp_events e WHERE e.is_scoring_play = true AND coalesce(e.points_scored, 0) > 0
  GROUP BY e.game_id, e.team_id, e.home_team_id, e.away_team_id
)
SELECT lt.game_id,
  max(CASE WHEN ls.team_id = ls.home_team_id AND lt.current_elapsed_seconds IS NOT NULL AND ls.last_score_elapsed_seconds IS NOT NULL
    THEN greatest(0, lt.current_elapsed_seconds - ls.last_score_elapsed_seconds)::int END) AS drought_home_sec,
  max(CASE WHEN ls.team_id = ls.away_team_id AND lt.current_elapsed_seconds IS NOT NULL AND ls.last_score_elapsed_seconds IS NOT NULL
    THEN greatest(0, lt.current_elapsed_seconds - ls.last_score_elapsed_seconds)::int END) AS drought_away_sec
FROM latest_time lt LEFT JOIN last_scores ls ON ls.game_id = lt.game_id GROUP BY lt.game_id;

-- 11) Momentum view
CREATE OR REPLACE VIEW public.v_game_momentum AS
SELECT rr.game_id, coalesce(rr.recent_run_home, 0) AS recent_run_home, coalesce(rr.recent_run_away, 0) AS recent_run_away,
  CASE WHEN coalesce(rr.recent_run_home, 0) > coalesce(rr.recent_run_away, 0) THEN 'home'
    WHEN coalesce(rr.recent_run_away, 0) > coalesce(rr.recent_run_home, 0) THEN 'away' ELSE NULL END AS momentum_side,
  abs(coalesce(rr.recent_run_home, 0) - coalesce(rr.recent_run_away, 0))::numeric AS momentum_score
FROM public.v_game_recent_runs rr;

-- 12) Combined derived metrics view
CREATE OR REPLACE VIEW public.v_game_watch_derived_metrics AS
SELECT s.game_id, s.home_team_id, s.away_team_id, s.period_number, s.clock_display, s.home_score, s.away_score,
  lp.possession_team_id, lp.possession_confidence,
  coalesce(rr.recent_run_home, 0) AS recent_run_home, coalesce(rr.recent_run_away, 0) AS recent_run_away,
  d.drought_home_sec, d.drought_away_sec,
  gp.estimated_possessions, gp2.live_pace_48,
  CASE WHEN m.momentum_side = 'home' THEN s.home_team_id WHEN m.momentum_side = 'away' THEN s.away_team_id ELSE NULL END AS momentum_team_id,
  m.momentum_score
FROM public.live_game_visual_state s
LEFT JOIN public.v_latest_possession_signal lp ON lp.game_id = s.game_id
LEFT JOIN public.v_game_recent_runs rr ON rr.game_id = s.game_id
LEFT JOIN public.v_game_scoring_droughts d ON d.game_id = s.game_id
LEFT JOIN public.v_game_possession_counts gp ON gp.game_id = s.game_id
LEFT JOIN public.v_game_live_pace gp2 ON gp2.game_id = s.game_id
LEFT JOIN public.v_game_momentum m ON m.game_id = s.game_id;

-- 13) Refresh function
CREATE OR REPLACE FUNCTION public.refresh_live_game_derived_metrics(p_game_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_possession_team_id text; v_possession_confidence numeric;
  v_recent_run_home int; v_recent_run_away int;
  v_drought_home_sec int; v_drought_away_sec int;
  v_live_pace_48 numeric; v_momentum_team_id text; v_momentum_score numeric;
BEGIN
  SELECT dm.possession_team_id, dm.possession_confidence, dm.recent_run_home, dm.recent_run_away,
    dm.drought_home_sec, dm.drought_away_sec, dm.live_pace_48, dm.momentum_team_id, dm.momentum_score
  INTO v_possession_team_id, v_possession_confidence, v_recent_run_home, v_recent_run_away,
    v_drought_home_sec, v_drought_away_sec, v_live_pace_48, v_momentum_team_id, v_momentum_score
  FROM public.v_game_watch_derived_metrics dm WHERE dm.game_id = p_game_id;

  UPDATE public.live_game_visual_state SET
    possession_team_id = coalesce(v_possession_team_id, live_game_visual_state.possession_team_id),
    possession_confidence = coalesce(v_possession_confidence, live_game_visual_state.possession_confidence),
    recent_run_home = coalesce(v_recent_run_home, 0), recent_run_away = coalesce(v_recent_run_away, 0),
    recent_scoring_drought_home_sec = v_drought_home_sec, recent_scoring_drought_away_sec = v_drought_away_sec,
    pace_estimate = v_live_pace_48, momentum_team_id = v_momentum_team_id, momentum_score = v_momentum_score,
    updated_at = now()
  WHERE game_id = p_game_id;
END; $$;

-- 14) One-shot helper
CREATE OR REPLACE FUNCTION public.refresh_live_game_after_event(p_game_id text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM public.refresh_live_game_derived_metrics(p_game_id); END; $$;

-- 15) Trigger
CREATE OR REPLACE FUNCTION public.trg_refresh_live_game_after_normalized_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM public.refresh_live_game_after_event(NEW.game_id); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_normalized_pbp_events_refresh_live_metrics ON public.normalized_pbp_events;

CREATE TRIGGER trg_normalized_pbp_events_refresh_live_metrics
AFTER INSERT ON public.normalized_pbp_events
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_live_game_after_normalized_event();
