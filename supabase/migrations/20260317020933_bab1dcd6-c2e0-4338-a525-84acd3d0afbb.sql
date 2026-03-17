BEGIN;

SET search_path TO public;

-- PHASE 2: dependency-aware cleanup of known publish blockers
DROP TRIGGER IF EXISTS trg_after_normalized_pbp_event_refresh ON public.normalized_pbp_events;
DROP TRIGGER IF EXISTS trg_normalized_pbp_events_refresh_live_metrics ON public.normalized_pbp_events;

DROP FUNCTION IF EXISTS public.after_normalized_pbp_event_refresh();
DROP FUNCTION IF EXISTS public.refresh_live_game_phase2_metrics(text);
DROP FUNCTION IF EXISTS public.trg_refresh_live_game_after_normalized_event();

-- Remove test-only/stale phase-2 helper views (not in Live, caused drift)
DROP VIEW IF EXISTS public.v_pbp_fg_makes;
DROP VIEW IF EXISTS public.v_pbp_fg_misses;
DROP VIEW IF EXISTS public.v_pbp_fg_scoring_events;
DROP VIEW IF EXISTS public.v_pbp_offensive_rebounds;
DROP VIEW IF EXISTS public.v_pbp_possession_change_events;
DROP VIEW IF EXISTS public.v_pbp_possession_end_events;
DROP VIEW IF EXISTS public.v_pbp_scoring_events;
DROP VIEW IF EXISTS public.v_pbp_team_foul_events;

-- Drop derived views in reverse dependency order before rebuild
DROP VIEW IF EXISTS public.v_game_watch_derived_metrics;
DROP VIEW IF EXISTS public.v_game_momentum;
DROP VIEW IF EXISTS public.v_game_scoring_droughts;
DROP VIEW IF EXISTS public.v_game_recent_runs;
DROP VIEW IF EXISTS public.v_game_live_pace;
DROP VIEW IF EXISTS public.v_game_elapsed_time;
DROP VIEW IF EXISTS public.v_game_possession_counts;
DROP VIEW IF EXISTS public.v_latest_possession_signal;
DROP VIEW IF EXISTS public.v_game_watch_debug;
DROP VIEW IF EXISTS public.v_latest_normalized_pbp_events;

-- Drop/rebuild chain that caused "column s.player_id does not exist" during publish
DROP VIEW IF EXISTS public.fantasy_scores;
DROP VIEW IF EXISTS public.player_stats_by_window;

-- Remove duplicate/conflicting indexes found only in Test
DROP INDEX IF EXISTS public.idx_norm_pbp_created;
DROP INDEX IF EXISTS public.idx_norm_pbp_game_id;
DROP INDEX IF EXISTS public.idx_norm_pbp_game_source_event;
DROP INDEX IF EXISTS public.idx_pbp_game_sequence;

-- PHASE 3: normalize schema (idempotent)
ALTER TABLE IF EXISTS public.normalized_pbp_events
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS normalized_description text,
  ADD COLUMN IF NOT EXISTS primary_player_name text,
  ADD COLUMN IF NOT EXISTS secondary_player_name text,
  ADD COLUMN IF NOT EXISTS home_team_id text,
  ADD COLUMN IF NOT EXISTS away_team_id text,
  ADD COLUMN IF NOT EXISTS possession_team_id_after text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.live_game_visual_state
  ADD COLUMN IF NOT EXISTS sport text,
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS last_event_player_id text,
  ADD COLUMN IF NOT EXISTS last_event_points integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS animation_status text,
  ADD COLUMN IF NOT EXISTS visual_mode_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS last_source_event_id text,
  ADD COLUMN IF NOT EXISTS last_ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.visual_event_queue
  ADD COLUMN IF NOT EXISTS is_consumed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_skipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normalized_pbp_events_event_type_fk'
      AND conrelid = 'public.normalized_pbp_events'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_events
      ADD CONSTRAINT normalized_pbp_events_event_type_fk
      FOREIGN KEY (event_type) REFERENCES public.pbp_event_type_catalog(event_type);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normalized_pbp_events_zone_fk'
      AND conrelid = 'public.normalized_pbp_events'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_events
      ADD CONSTRAINT normalized_pbp_events_zone_fk
      FOREIGN KEY (zone_key) REFERENCES public.pbp_zone_catalog(zone_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normalized_pbp_events_animation_fk'
      AND conrelid = 'public.normalized_pbp_events'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_events
      ADD CONSTRAINT normalized_pbp_events_animation_fk
      FOREIGN KEY (animation_key) REFERENCES public.pbp_animation_catalog(animation_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visual_event_queue_normalized_event_id_fkey'
      AND conrelid = 'public.visual_event_queue'::regclass
  ) THEN
    ALTER TABLE public.visual_event_queue
      ADD CONSTRAINT visual_event_queue_normalized_event_id_fkey
      FOREIGN KEY (normalized_event_id) REFERENCES public.normalized_pbp_events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_game_visual_state_event_zone_fk'
      AND conrelid = 'public.live_game_visual_state'::regclass
  ) THEN
    ALTER TABLE public.live_game_visual_state
      ADD CONSTRAINT live_game_visual_state_event_zone_fk
      FOREIGN KEY (event_zone) REFERENCES public.pbp_zone_catalog(zone_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_game_visual_state_animation_fk'
      AND conrelid = 'public.live_game_visual_state'::regclass
  ) THEN
    ALTER TABLE public.live_game_visual_state
      ADD CONSTRAINT live_game_visual_state_animation_fk
      FOREIGN KEY (animation_key) REFERENCES public.pbp_animation_catalog(animation_key);
  END IF;
END $$;

-- PHASE 5 indexes (canonical)
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_id
  ON public.normalized_pbp_events (game_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_created_at
  ON public.normalized_pbp_events (game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_created_at
  ON public.normalized_pbp_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_event_type
  ON public.normalized_pbp_events (event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_sequence
  ON public.normalized_pbp_events (game_id, period_number, sequence_number, event_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_source_event_unique
  ON public.normalized_pbp_events (game_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_clock
  ON public.normalized_pbp_events (game_id, period_number, clock_seconds_remaining, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_scoring
  ON public.normalized_pbp_events (game_id, is_scoring_play, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_team_scoring
  ON public.normalized_pbp_events (game_id, team_id, is_scoring_play, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_possession
  ON public.normalized_pbp_events (game_id, possession_result, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_event_id
  ON public.normalized_pbp_event_tags (normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_tag_key
  ON public.normalized_pbp_event_tags (tag_key);

CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_last_event_id
  ON public.live_game_visual_state (last_event_id);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_status
  ON public.live_game_visual_state (status);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_updated_at
  ON public.live_game_visual_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_id
  ON public.visual_event_queue (game_id);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_available
  ON public.visual_event_queue (game_id, available_at, created_at)
  WHERE is_consumed = false AND is_skipped = false;

CREATE INDEX IF NOT EXISTS idx_admin_feature_access_user_id
  ON public.admin_feature_access (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_feature_access_feature_key
  ON public.admin_feature_access (feature_key);

-- PHASE 6: seed catalogs (safe)
INSERT INTO public.pbp_event_type_catalog (event_type)
VALUES
  ('made_shot'),('missed_shot'),('free_throw_made'),('free_throw_missed'),
  ('rebound_offensive'),('rebound_defensive'),('turnover'),('steal'),('block'),
  ('foul_personal'),('foul_shooting'),('foul_offensive'),('foul_loose_ball'),('foul_technical'),
  ('jump_ball'),('violation'),('timeout'),('substitution'),('unknown')
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO public.pbp_zone_catalog (zone_key)
VALUES ('unknown')
ON CONFLICT (zone_key) DO NOTHING;

INSERT INTO public.pbp_animation_catalog (animation_key)
VALUES ('none')
ON CONFLICT (animation_key) DO NOTHING;

-- PHASE 7: helper + queue/live-state functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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
END;
$$;

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
END;
$$;

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

CREATE OR REPLACE FUNCTION public.consume_visual_event(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.visual_event_queue
  SET is_consumed = true, consumed_at = now()
  WHERE id = p_queue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_visual_event(p_game_id text)
RETURNS TABLE(
  id uuid,
  game_id text,
  normalized_event_id uuid,
  event_type text,
  event_subtype text,
  team_id text,
  primary_player_id text,
  primary_player_name text,
  clock_display text,
  zone_key text,
  animation_key text,
  display_text text,
  priority integer,
  available_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
AS $$
  SELECT q.id, q.game_id, q.normalized_event_id, q.event_type,
         q.event_subtype, q.team_id, q.primary_player_id,
         q.primary_player_name, q.clock_display, q.zone_key,
         q.animation_key, q.display_text, q.priority,
         q.available_at, q.created_at
  FROM public.visual_event_queue q
  WHERE q.game_id = p_game_id
    AND q.is_consumed = false
    AND q.is_skipped = false
    AND q.available_at <= now()
  ORDER BY q.priority ASC, q.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_visual_event_queue()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.visual_event_queue
  WHERE created_at < now() - interval '4 hours';
$$;

CREATE OR REPLACE FUNCTION public.trim_visual_event_queue(p_game_id text)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.visual_event_queue
  WHERE game_id = p_game_id
    AND id NOT IN (
      SELECT id
      FROM public.visual_event_queue
      WHERE game_id = p_game_id
      ORDER BY created_at DESC
      LIMIT 100
    );
$$;

-- PHASE 10: trigger normalization (single canonical trigger per table)
DROP TRIGGER IF EXISTS trg_admin_feature_access_updated_at ON public.admin_feature_access;
CREATE TRIGGER trg_admin_feature_access_updated_at
BEFORE UPDATE ON public.admin_feature_access
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_app_feature_flags_updated_at ON public.app_feature_flags;
CREATE TRIGGER trg_app_feature_flags_updated_at
BEFORE UPDATE ON public.app_feature_flags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_live_game_visual_state_updated_at ON public.live_game_visual_state;
CREATE TRIGGER trg_live_game_visual_state_updated_at
BEFORE UPDATE ON public.live_game_visual_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_normalized_pbp_events_updated_at ON public.normalized_pbp_events;
CREATE TRIGGER trg_normalized_pbp_events_updated_at
BEFORE UPDATE ON public.normalized_pbp_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PHASE 11: views (dependency-safe rebuild)
CREATE OR REPLACE VIEW public.v_latest_normalized_pbp_events AS
SELECT
  id,
  game_id,
  source_event_id,
  source_provider,
  sport,
  league,
  period_number,
  clock_display,
  event_index,
  sequence_number,
  team_id,
  primary_player_name,
  secondary_player_name,
  event_type,
  event_subtype,
  points_scored,
  possession_result,
  score_home_after,
  score_away_after,
  zone_key,
  animation_key,
  raw_description,
  parser_confidence,
  parser_version,
  created_at
FROM public.normalized_pbp_events
ORDER BY created_at DESC;

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
      WHEN e.possession_result IN ('change_possession', 'retain_possession') THEN coalesce(e.parser_confidence, 0.75)
      ELSE NULL
    END AS possession_confidence_signal
  FROM public.normalized_pbp_events e
  WHERE e.possession_result IN ('change_possession', 'retain_possession')
), ranked AS (
  SELECT ps.*, row_number() OVER (
    PARTITION BY ps.game_id
    ORDER BY ps.period_number DESC NULLS LAST, ps.clock_seconds_remaining ASC NULLS LAST, ps.created_at DESC
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

CREATE OR REPLACE VIEW public.v_game_possession_counts AS
SELECT
  e.game_id,
  max(e.league) AS league,
  count(*) FILTER (
    WHERE e.event_type = 'made_shot'
       OR (e.event_type = 'free_throw_made' AND e.event_subtype = 'final_ft')
       OR e.event_type = 'rebound_defensive'
       OR e.event_type = 'turnover'
       OR e.event_type = 'foul_offensive'
       OR (e.event_type = 'violation' AND e.possession_result = 'change_possession')
       OR e.event_type = 'jump_ball'
  ) AS estimated_possessions
FROM public.normalized_pbp_events e
GROUP BY e.game_id;

CREATE OR REPLACE VIEW public.v_game_elapsed_time AS
WITH latest_clock AS (
  SELECT DISTINCT ON (e.game_id)
    e.game_id,
    e.league,
    e.period_number,
    e.clock_display,
    e.clock_seconds_remaining,
    e.created_at
  FROM public.normalized_pbp_events e
  ORDER BY e.game_id, e.created_at DESC
)
SELECT
  lc.game_id,
  lc.league,
  lc.period_number,
  lc.clock_display,
  lc.clock_seconds_remaining,
  public.get_basketball_elapsed_seconds(lc.league, lc.period_number, lc.clock_seconds_remaining) AS elapsed_seconds
FROM latest_clock lc;

CREATE OR REPLACE VIEW public.v_game_live_pace AS
SELECT
  pc.game_id,
  pc.league,
  pc.estimated_possessions,
  et.elapsed_seconds,
  CASE
    WHEN et.elapsed_seconds IS NULL OR et.elapsed_seconds <= 0 THEN NULL
    ELSE round(((pc.estimated_possessions::numeric / et.elapsed_seconds::numeric) * 2880)::numeric, 3)
  END AS live_pace_48
FROM public.v_game_possession_counts pc
LEFT JOIN public.v_game_elapsed_time et ON et.game_id = pc.game_id;

CREATE OR REPLACE VIEW public.v_game_recent_runs AS
WITH latest_time AS (
  SELECT et.game_id, et.elapsed_seconds AS current_elapsed_seconds
  FROM public.v_game_elapsed_time et
),
scoring_events AS (
  SELECT
    e.game_id,
    e.team_id,
    e.home_team_id,
    e.away_team_id,
    e.points_scored,
    public.get_basketball_elapsed_seconds(e.league, e.period_number, e.clock_seconds_remaining) AS event_elapsed_seconds
  FROM public.normalized_pbp_events e
  WHERE e.is_scoring_play = true
    AND coalesce(e.points_scored, 0) > 0
),
windowed AS (
  SELECT
    se.game_id,
    se.team_id,
    se.home_team_id,
    se.away_team_id,
    sum(se.points_scored) AS team_run_points
  FROM scoring_events se
  JOIN latest_time lt ON lt.game_id = se.game_id
  WHERE se.event_elapsed_seconds IS NOT NULL
    AND lt.current_elapsed_seconds IS NOT NULL
    AND se.event_elapsed_seconds >= greatest(0, lt.current_elapsed_seconds - 120)
  GROUP BY se.game_id, se.team_id, se.home_team_id, se.away_team_id
)
SELECT
  g.game_id,
  max(CASE WHEN w.team_id = w.home_team_id THEN w.team_run_points END) AS recent_run_home,
  max(CASE WHEN w.team_id = w.away_team_id THEN w.team_run_points END) AS recent_run_away
FROM (SELECT DISTINCT game_id FROM public.normalized_pbp_events) g
LEFT JOIN windowed w ON w.game_id = g.game_id
GROUP BY g.game_id;

CREATE OR REPLACE VIEW public.v_game_scoring_droughts AS
WITH latest_time AS (
  SELECT et.game_id, et.elapsed_seconds AS current_elapsed_seconds
  FROM public.v_game_elapsed_time et
),
last_scores AS (
  SELECT
    e.game_id,
    e.team_id,
    e.home_team_id,
    e.away_team_id,
    max(public.get_basketball_elapsed_seconds(e.league, e.period_number, e.clock_seconds_remaining)) AS last_score_elapsed_seconds
  FROM public.normalized_pbp_events e
  WHERE e.is_scoring_play = true
    AND coalesce(e.points_scored, 0) > 0
  GROUP BY e.game_id, e.team_id, e.home_team_id, e.away_team_id
)
SELECT
  lt.game_id,
  max(CASE WHEN ls.team_id = ls.home_team_id
            AND lt.current_elapsed_seconds IS NOT NULL
            AND ls.last_score_elapsed_seconds IS NOT NULL
           THEN greatest(0, lt.current_elapsed_seconds - ls.last_score_elapsed_seconds)::int END) AS drought_home_sec,
  max(CASE WHEN ls.team_id = ls.away_team_id
            AND lt.current_elapsed_seconds IS NOT NULL
            AND ls.last_score_elapsed_seconds IS NOT NULL
           THEN greatest(0, lt.current_elapsed_seconds - ls.last_score_elapsed_seconds)::int END) AS drought_away_sec
FROM latest_time lt
LEFT JOIN last_scores ls ON ls.game_id = lt.game_id
GROUP BY lt.game_id;

CREATE OR REPLACE VIEW public.v_game_momentum AS
SELECT
  rr.game_id,
  coalesce(rr.recent_run_home, 0) AS recent_run_home,
  coalesce(rr.recent_run_away, 0) AS recent_run_away,
  CASE
    WHEN coalesce(rr.recent_run_home, 0) > coalesce(rr.recent_run_away, 0) THEN 'home'
    WHEN coalesce(rr.recent_run_away, 0) > coalesce(rr.recent_run_home, 0) THEN 'away'
    ELSE NULL
  END AS momentum_side,
  abs(coalesce(rr.recent_run_home, 0) - coalesce(rr.recent_run_away, 0))::numeric AS momentum_score
FROM public.v_game_recent_runs rr;

CREATE OR REPLACE VIEW public.v_game_watch_derived_metrics AS
SELECT
  s.game_id,
  s.home_team_id,
  s.away_team_id,
  s.period_number,
  s.clock_display,
  s.home_score,
  s.away_score,
  lp.possession_team_id,
  lp.possession_confidence,
  coalesce(rr.recent_run_home, 0) AS recent_run_home,
  coalesce(rr.recent_run_away, 0) AS recent_run_away,
  d.drought_home_sec,
  d.drought_away_sec,
  gp.estimated_possessions,
  gp2.live_pace_48,
  CASE
    WHEN m.momentum_side = 'home' THEN s.home_team_id
    WHEN m.momentum_side = 'away' THEN s.away_team_id
    ELSE NULL
  END AS momentum_team_id,
  m.momentum_score
FROM public.live_game_visual_state s
LEFT JOIN public.v_latest_possession_signal lp ON lp.game_id = s.game_id
LEFT JOIN public.v_game_recent_runs rr ON rr.game_id = s.game_id
LEFT JOIN public.v_game_scoring_droughts d ON d.game_id = s.game_id
LEFT JOIN public.v_game_possession_counts gp ON gp.game_id = s.game_id
LEFT JOIN public.v_game_live_pace gp2 ON gp2.game_id = s.game_id
LEFT JOIN public.v_game_momentum m ON m.game_id = s.game_id;

-- Restore legacy-safe versions to prevent publish diff ordering failure in Live
CREATE OR REPLACE VIEW public.player_stats_by_window AS
SELECT
  game_id,
  player_name,
  sum(points) AS game_points,
  sum(points) FILTER (WHERE period = ANY (ARRAY[1,2])) AS first_half_points,
  sum(points) FILTER (WHERE period = ANY (ARRAY[3,4])) AS second_half_points,
  sum(points) FILTER (WHERE period = 1) AS q1_points,
  sum(points) FILTER (WHERE period = 2) AS q2_points,
  sum(points) FILTER (WHERE period = 3) AS q3_points,
  sum(points) FILTER (WHERE period = 4) AS q4_points,
  sum(rebounds) AS rebounds,
  sum(assists) AS assists,
  sum(steals) AS steals,
  sum(blocks) AS blocks,
  sum(turnovers) AS turnovers
FROM public.player_event_stats
GROUP BY game_id, player_name;

CREATE OR REPLACE VIEW public.fantasy_scores AS
SELECT
  game_id,
  player_name,
  (((((game_points + (rebounds * 1.2)) + (assists * 1.5)) + (steals * 3::numeric)) + (blocks * 3::numeric)) - turnovers) AS fantasy_score
FROM public.player_stats_by_window;

-- Reset view reloptions for deployment stability
ALTER VIEW public.v_latest_normalized_pbp_events RESET (security_invoker);
ALTER VIEW public.v_game_watch_debug RESET (security_invoker);
ALTER VIEW public.v_latest_possession_signal RESET (security_invoker);
ALTER VIEW public.v_game_possession_counts RESET (security_invoker);
ALTER VIEW public.v_game_elapsed_time RESET (security_invoker);
ALTER VIEW public.v_game_live_pace RESET (security_invoker);
ALTER VIEW public.v_game_recent_runs RESET (security_invoker);
ALTER VIEW public.v_game_scoring_droughts RESET (security_invoker);
ALTER VIEW public.v_game_momentum RESET (security_invoker);
ALTER VIEW public.v_game_watch_derived_metrics RESET (security_invoker);
ALTER VIEW public.player_stats_by_window RESET (security_invoker);
ALTER VIEW public.fantasy_scores RESET (security_invoker);

-- PHASE 12: derived refresh functions + trigger
CREATE OR REPLACE FUNCTION public.refresh_live_game_derived_metrics(p_game_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_possession_team_id text;
  v_possession_confidence numeric;
  v_recent_run_home int;
  v_recent_run_away int;
  v_drought_home_sec int;
  v_drought_away_sec int;
  v_live_pace_48 numeric;
  v_momentum_team_id text;
  v_momentum_score numeric;
BEGIN
  SELECT
    dm.possession_team_id,
    dm.possession_confidence,
    dm.recent_run_home,
    dm.recent_run_away,
    dm.drought_home_sec,
    dm.drought_away_sec,
    dm.live_pace_48,
    dm.momentum_team_id,
    dm.momentum_score
  INTO
    v_possession_team_id,
    v_possession_confidence,
    v_recent_run_home,
    v_recent_run_away,
    v_drought_home_sec,
    v_drought_away_sec,
    v_live_pace_48,
    v_momentum_team_id,
    v_momentum_score
  FROM public.v_game_watch_derived_metrics dm
  WHERE dm.game_id = p_game_id;

  UPDATE public.live_game_visual_state
  SET
    possession_team_id = coalesce(v_possession_team_id, live_game_visual_state.possession_team_id),
    possession_confidence = coalesce(v_possession_confidence, live_game_visual_state.possession_confidence),
    recent_run_home = coalesce(v_recent_run_home, 0),
    recent_run_away = coalesce(v_recent_run_away, 0),
    recent_scoring_drought_home_sec = v_drought_home_sec,
    recent_scoring_drought_away_sec = v_drought_away_sec,
    pace_estimate = v_live_pace_48,
    momentum_team_id = v_momentum_team_id,
    momentum_score = v_momentum_score,
    updated_at = now()
  WHERE game_id = p_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_live_game_after_event(p_game_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_live_game_derived_metrics(p_game_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_live_game_after_normalized_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_live_game_after_event(NEW.game_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalized_pbp_events_refresh_live_metrics ON public.normalized_pbp_events;
CREATE TRIGGER trg_normalized_pbp_events_refresh_live_metrics
AFTER INSERT ON public.normalized_pbp_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_live_game_after_normalized_event();

COMMIT;