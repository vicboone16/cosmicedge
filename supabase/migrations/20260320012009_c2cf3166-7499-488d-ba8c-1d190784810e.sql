-- MIGRATION REPAIR PACK: Cosmic Edge PBP Watch Mode schema normalization
-- Scope-limited to PBP watch/visualizer objects only (no unrelated table resets)

SET search_path TO public;

-- =====================================================
-- PHASE 1/2: dependency-aware cleanup of blocker-prone objects
-- =====================================================
DROP TRIGGER IF EXISTS trg_normalized_pbp_events_refresh_live_metrics ON public.normalized_pbp_events;
DROP TRIGGER IF EXISTS trg_after_normalized_pbp_event_refresh ON public.normalized_pbp_events;

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

-- stale/test-only leftovers from prior failed chains
DROP VIEW IF EXISTS public.v_pbp_fg_makes;
DROP VIEW IF EXISTS public.v_pbp_fg_misses;
DROP VIEW IF EXISTS public.v_pbp_fg_scoring_events;
DROP VIEW IF EXISTS public.v_pbp_offensive_rebounds;
DROP VIEW IF EXISTS public.v_pbp_possession_change_events;
DROP VIEW IF EXISTS public.v_pbp_possession_end_events;
DROP VIEW IF EXISTS public.v_pbp_scoring_events;
DROP VIEW IF EXISTS public.v_pbp_team_foul_events;

-- stale/conflicting index names observed in failed attempts
DROP INDEX IF EXISTS public.idx_norm_pbp_created;
DROP INDEX IF EXISTS public.idx_norm_pbp_game_id;
DROP INDEX IF EXISTS public.idx_norm_pbp_game_source_event;
DROP INDEX IF EXISTS public.idx_pbp_game_sequence;
DROP INDEX IF EXISTS public.idx_visual_state_game;

-- =====================================================
-- PHASE 3: base tables + missing columns
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbp_event_type_catalog (
  event_type text PRIMARY KEY,
  description text
);

CREATE TABLE IF NOT EXISTS public.pbp_zone_catalog (
  zone_key text PRIMARY KEY,
  description text
);

CREATE TABLE IF NOT EXISTS public.pbp_animation_catalog (
  animation_key text PRIMARY KEY,
  description text
);

CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key text PRIMARY KEY,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_feature_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.normalized_pbp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL,
  source_event_id text,
  source_provider text,
  sport text,
  league text,
  period_number integer,
  clock_display text,
  clock_seconds_remaining integer,
  event_index integer,
  sequence_number integer,
  team_id text,
  opponent_team_id text,
  home_team_id text,
  away_team_id text,
  primary_player_id text,
  primary_player_name text,
  secondary_player_id text,
  secondary_player_name text,
  tertiary_player_id text,
  event_type text NOT NULL,
  event_subtype text,
  points_scored integer DEFAULT 0,
  possession_result text,
  possession_team_id_after text,
  score_home_after integer,
  score_away_after integer,
  is_scoring_play boolean DEFAULT false,
  is_turnover boolean DEFAULT false,
  is_rebound boolean DEFAULT false,
  is_foul boolean DEFAULT false,
  is_timeout boolean DEFAULT false,
  is_substitution boolean DEFAULT false,
  zone_key text,
  animation_key text,
  raw_description text,
  normalized_description text,
  parser_confidence numeric,
  parser_version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.normalized_pbp_event_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_event_id uuid NOT NULL,
  tag_key text NOT NULL,
  tag_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_game_visual_state (
  game_id text PRIMARY KEY,
  sport text,
  league text,
  status text,
  home_team_id text,
  away_team_id text,
  period_number integer DEFAULT 1,
  period_label text,
  clock_display text,
  clock_seconds_remaining integer,
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,
  possession_team_id text,
  possession_confidence numeric DEFAULT 0.35,
  last_event_id uuid,
  last_event_type text,
  last_event_subtype text,
  last_event_team_id text,
  last_event_player_id text,
  last_event_player_name text,
  last_event_text text,
  last_event_points integer NOT NULL DEFAULT 0,
  event_zone text,
  animation_key text,
  animation_status text,
  momentum_team_id text,
  momentum_score numeric DEFAULT 0,
  recent_run_home integer NOT NULL DEFAULT 0,
  recent_run_away integer NOT NULL DEFAULT 0,
  recent_scoring_drought_home_sec integer,
  recent_scoring_drought_away_sec integer,
  pace_estimate numeric,
  in_bonus_home boolean NOT NULL DEFAULT false,
  in_bonus_away boolean NOT NULL DEFAULT false,
  home_fouls_period integer NOT NULL DEFAULT 0,
  away_fouls_period integer NOT NULL DEFAULT 0,
  sync_latency_ms integer,
  visual_mode_enabled boolean NOT NULL DEFAULT true,
  parser_version text,
  source_provider text,
  last_source_event_id text,
  last_ingested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  empty_possessions_home integer DEFAULT 0,
  empty_possessions_away integer DEFAULT 0,
  empty_poss_home_last_n integer DEFAULT 0,
  empty_poss_away_last_n integer DEFAULT 0,
  fg_drought_home_sec integer,
  fg_drought_away_sec integer,
  oreb_home_period integer DEFAULT 0,
  oreb_away_period integer DEFAULT 0,
  oreb_pressure_team_id text,
  off_reb_last_5min_home integer NOT NULL DEFAULT 0,
  off_reb_last_5min_away integer NOT NULL DEFAULT 0,
  second_chance_pressure_team_id text,
  bonus_danger_home boolean NOT NULL DEFAULT false,
  bonus_danger_away boolean NOT NULL DEFAULT false,
  bonus_danger_team_id text
);

CREATE TABLE IF NOT EXISTS public.visual_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL,
  normalized_event_id uuid,
  event_type text NOT NULL,
  event_subtype text,
  team_id text,
  primary_player_id text,
  primary_player_name text,
  clock_display text,
  zone_key text,
  animation_key text,
  display_text text,
  priority integer NOT NULL DEFAULT 100,
  is_consumed boolean DEFAULT false,
  is_skipped boolean NOT NULL DEFAULT false,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.pbp_parser_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text,
  source_event_id text,
  source_provider text,
  raw_description text,
  error_stage text,
  error_message text,
  error_detail text,
  parser_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.normalized_pbp_events
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS normalized_description text,
  ADD COLUMN IF NOT EXISTS primary_player_name text,
  ADD COLUMN IF NOT EXISTS secondary_player_name text,
  ADD COLUMN IF NOT EXISTS home_team_id text,
  ADD COLUMN IF NOT EXISTS away_team_id text,
  ADD COLUMN IF NOT EXISTS possession_team_id_after text,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.live_game_visual_state
  ADD COLUMN IF NOT EXISTS sport text,
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS last_event_player_id text,
  ADD COLUMN IF NOT EXISTS last_event_points integer,
  ADD COLUMN IF NOT EXISTS animation_status text,
  ADD COLUMN IF NOT EXISTS visual_mode_enabled boolean,
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS last_source_event_id text,
  ADD COLUMN IF NOT EXISTS last_ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.visual_event_queue
  ADD COLUMN IF NOT EXISTS primary_player_name text,
  ADD COLUMN IF NOT EXISTS is_consumed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_skipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_at timestamptz DEFAULT now();

-- normalize nullability/defaults for key runtime columns
UPDATE public.live_game_visual_state
SET
  home_score = COALESCE(home_score, 0),
  away_score = COALESCE(away_score, 0),
  last_event_points = COALESCE(last_event_points, 0),
  recent_run_home = COALESCE(recent_run_home, 0),
  recent_run_away = COALESCE(recent_run_away, 0),
  in_bonus_home = COALESCE(in_bonus_home, false),
  in_bonus_away = COALESCE(in_bonus_away, false),
  home_fouls_period = COALESCE(home_fouls_period, 0),
  away_fouls_period = COALESCE(away_fouls_period, 0),
  visual_mode_enabled = COALESCE(visual_mode_enabled, true),
  off_reb_last_5min_home = COALESCE(off_reb_last_5min_home, 0),
  off_reb_last_5min_away = COALESCE(off_reb_last_5min_away, 0),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE IF EXISTS public.live_game_visual_state
  ALTER COLUMN home_score SET DEFAULT 0,
  ALTER COLUMN away_score SET DEFAULT 0,
  ALTER COLUMN last_event_points SET DEFAULT 0,
  ALTER COLUMN recent_run_home SET DEFAULT 0,
  ALTER COLUMN recent_run_away SET DEFAULT 0,
  ALTER COLUMN in_bonus_home SET DEFAULT false,
  ALTER COLUMN in_bonus_away SET DEFAULT false,
  ALTER COLUMN home_fouls_period SET DEFAULT 0,
  ALTER COLUMN away_fouls_period SET DEFAULT 0,
  ALTER COLUMN visual_mode_enabled SET DEFAULT true,
  ALTER COLUMN off_reb_last_5min_home SET DEFAULT 0,
  ALTER COLUMN off_reb_last_5min_away SET DEFAULT 0,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE IF EXISTS public.live_game_visual_state
  ALTER COLUMN home_score SET NOT NULL,
  ALTER COLUMN away_score SET NOT NULL,
  ALTER COLUMN last_event_points SET NOT NULL,
  ALTER COLUMN recent_run_home SET NOT NULL,
  ALTER COLUMN recent_run_away SET NOT NULL,
  ALTER COLUMN in_bonus_home SET NOT NULL,
  ALTER COLUMN in_bonus_away SET NOT NULL,
  ALTER COLUMN home_fouls_period SET NOT NULL,
  ALTER COLUMN away_fouls_period SET NOT NULL,
  ALTER COLUMN visual_mode_enabled SET NOT NULL,
  ALTER COLUMN off_reb_last_5min_home SET NOT NULL,
  ALTER COLUMN off_reb_last_5min_away SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.visual_event_queue
SET
  priority = COALESCE(priority, 100),
  is_skipped = COALESCE(is_skipped, false),
  available_at = COALESCE(available_at, now());

ALTER TABLE IF EXISTS public.visual_event_queue
  ALTER COLUMN priority SET DEFAULT 100,
  ALTER COLUMN is_skipped SET DEFAULT false,
  ALTER COLUMN available_at SET DEFAULT now(),
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN is_skipped SET NOT NULL,
  ALTER COLUMN available_at SET NOT NULL;

-- =====================================================
-- PHASE 4: constraints + foreign keys (guarded)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_feature_access_user_feature_unique'
      AND conrelid = 'public.admin_feature_access'::regclass
  ) THEN
    ALTER TABLE public.admin_feature_access
      ADD CONSTRAINT admin_feature_access_user_feature_unique UNIQUE(user_id, feature_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_feature_access_feature_key_fkey'
      AND conrelid = 'public.admin_feature_access'::regclass
  ) THEN
    ALTER TABLE public.admin_feature_access
      ADD CONSTRAINT admin_feature_access_feature_key_fkey
      FOREIGN KEY (feature_key) REFERENCES public.app_feature_flags(key) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normalized_pbp_event_tags_normalized_event_id_fkey'
      AND conrelid = 'public.normalized_pbp_event_tags'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_event_tags
      ADD CONSTRAINT normalized_pbp_event_tags_normalized_event_id_fkey
      FOREIGN KEY (normalized_event_id) REFERENCES public.normalized_pbp_events(id) ON DELETE CASCADE;
  END IF;

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
    WHERE conname = 'live_game_visual_state_last_event_id_fkey'
      AND conrelid = 'public.live_game_visual_state'::regclass
  ) THEN
    ALTER TABLE public.live_game_visual_state
      ADD CONSTRAINT live_game_visual_state_last_event_id_fkey
      FOREIGN KEY (last_event_id) REFERENCES public.normalized_pbp_events(id) ON DELETE SET NULL;
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
    WHERE conname = 'normalized_pbp_events_points_scored_check'
      AND conrelid = 'public.normalized_pbp_events'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_events
      ADD CONSTRAINT normalized_pbp_events_points_scored_check
      CHECK (points_scored >= 0 AND points_scored <= 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'normalized_pbp_events_parser_confidence_check'
      AND conrelid = 'public.normalized_pbp_events'::regclass
  ) THEN
    ALTER TABLE public.normalized_pbp_events
      ADD CONSTRAINT normalized_pbp_events_parser_confidence_check
      CHECK (parser_confidence IS NULL OR (parser_confidence >= 0 AND parser_confidence <= 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_game_visual_state_possession_confidence_check'
      AND conrelid = 'public.live_game_visual_state'::regclass
  ) THEN
    ALTER TABLE public.live_game_visual_state
      ADD CONSTRAINT live_game_visual_state_possession_confidence_check
      CHECK (possession_confidence IS NULL OR (possession_confidence >= 0 AND possession_confidence <= 1));
  END IF;
END $$;

-- =====================================================
-- PHASE 5: indexes (canonical + idempotent)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_last_event_id ON public.live_game_visual_state(last_event_id);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_status ON public.live_game_visual_state(status);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_updated_at ON public.live_game_visual_state(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_animation_key ON public.live_game_visual_state(animation_key);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_event_zone ON public.live_game_visual_state(event_zone);

CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_source_event_unique
  ON public.normalized_pbp_events(game_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_created_at ON public.normalized_pbp_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_event_type ON public.normalized_pbp_events(event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_created_at ON public.normalized_pbp_events(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_id ON public.normalized_pbp_events(game_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_sequence ON public.normalized_pbp_events(game_id, period_number, sequence_number, event_index);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_clock ON public.normalized_pbp_events(game_id, period_number, clock_seconds_remaining, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_scoring ON public.normalized_pbp_events(game_id, is_scoring_play, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_team_scoring ON public.normalized_pbp_events(game_id, team_id, is_scoring_play, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_possession ON public.normalized_pbp_events(game_id, possession_result, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_primary_player_id ON public.normalized_pbp_events(primary_player_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_team_id ON public.normalized_pbp_events(team_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_zone_key ON public.normalized_pbp_events(zone_key);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_animation_key ON public.normalized_pbp_events(animation_key);
CREATE INDEX IF NOT EXISTS idx_norm_pbp_game_period ON public.normalized_pbp_events(game_id, period_number, event_index);
CREATE INDEX IF NOT EXISTS idx_pbp_event_type ON public.normalized_pbp_events(game_id, event_type);
CREATE INDEX IF NOT EXISTS idx_pbp_game_team ON public.normalized_pbp_events(game_id, team_id);

CREATE INDEX IF NOT EXISTS idx_pbp_parser_errors_game_id ON public.pbp_parser_errors(game_id);

CREATE INDEX IF NOT EXISTS idx_visual_event_queue_consumption ON public.visual_event_queue(game_id, is_consumed, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_available ON public.visual_event_queue(game_id, available_at, created_at)
  WHERE is_consumed = false AND is_skipped = false;
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_id ON public.visual_event_queue(game_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_event_queue_game_normalized_event_unique ON public.visual_event_queue(game_id, normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_normalized_event_id ON public.visual_event_queue(normalized_event_id);

CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_event_id ON public.normalized_pbp_event_tags(normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_tag_key ON public.normalized_pbp_event_tags(tag_key);

CREATE INDEX IF NOT EXISTS idx_admin_feature_access_feature_key ON public.admin_feature_access(feature_key);
CREATE INDEX IF NOT EXISTS idx_admin_feature_access_user_id ON public.admin_feature_access(user_id);

-- =====================================================
-- PHASE 6: seed catalogs + feature flag (safe upserts)
-- =====================================================
INSERT INTO public.pbp_event_type_catalog (event_type, description)
VALUES
  ('assist','Assist'),('block','Block'),('ejection','Ejection'),('foul_loose_ball','Loose ball foul'),('foul_offensive','Offensive foul'),
  ('foul_personal','Personal foul'),('foul_shooting','Shooting foul'),('foul_technical','Technical foul'),('free_throw_made','Made free throw'),
  ('free_throw_missed','Missed free throw'),('injury_stoppage','Injury stoppage'),('jump_ball','Jump ball'),('made_shot','Made field goal'),
  ('missed_shot','Missed field goal'),('period_end','End of period'),('period_start','Start of period'),('rebound_defensive','Defensive rebound'),
  ('rebound_offensive','Offensive rebound'),('review','Official review'),('steal','Steal'),('substitution','Substitution'),('timeout','Timeout'),
  ('turnover','Turnover'),('unknown','Unknown / unparsed'),('violation','Violation')
ON CONFLICT (event_type) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.pbp_zone_catalog (zone_key, description)
VALUES
  ('backcourt','Backcourt'),('bench','Bench area'),('corner_3_left','Left corner three'),('corner_3_right','Right corner three'),
  ('free_throw_line','Free throw line'),('midrange_center','Center midrange'),('midrange_left','Left midrange'),('midrange_right','Right midrange'),
  ('paint','Paint area'),('restricted_area','Restricted area'),('sideline','Sideline'),('top_3','Top of key three'),('unknown','Unknown zone'),
  ('wing_3_left','Left wing three'),('wing_3_right','Right wing three')
ON CONFLICT (zone_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.pbp_animation_catalog (animation_key, description)
VALUES
  ('def_rebound_secure','Defensive rebound secure'),('dunk_finish','Dunk finish animation'),('foul_whistle','Foul whistle animation'),
  ('free_throw_make','Made free throw animation'),('free_throw_miss','Missed free throw animation'),('jump_ball_start','Jump ball start'),
  ('layup_finish','Layup finish animation'),('made_2_basic','Basic made 2-point animation'),('made_3_basic','Basic made 3-point animation'),
  ('miss_2_basic','Missed 2-point animation'),('miss_3_basic','Missed 3-point animation'),('off_rebound_reset','Offensive rebound reset'),
  ('period_end_freeze','Period end freeze'),('period_start_reset','Period start reset'),('review_pause','Review pause state'),
  ('steal_flip','Steal possession flip'),('sub_bench_swap','Substitution bench swap'),('timeout_pause','Timeout pause state'),
  ('turnover_flip','Turnover possession flip'),('unknown','No reliable animation')
ON CONFLICT (animation_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_feature_flags (key, description, is_enabled, config)
VALUES ('enable_pbp_watch_mode', 'Enables admin-only Play-by-Play Watch mode', true, '{"admin_only": true}'::jsonb)
ON CONFLICT (key)
DO UPDATE SET
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  config = EXCLUDED.config,
  updated_at = now();

-- =====================================================
-- PHASE 7/8: helper + queue/live-state functions
-- =====================================================
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
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_elapsed numeric := 0;
  v_i int;
  v_period_minutes numeric;
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
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.visual_event_queue (
    game_id, normalized_event_id, event_type, event_subtype, team_id,
    primary_player_id, primary_player_name, clock_display, zone_key,
    animation_key, display_text, priority
  ) VALUES (
    p_game_id, p_normalized_event_id, p_event_type, p_event_subtype, p_team_id,
    p_primary_player_id, p_primary_player_name, p_clock_display, p_zone_key,
    p_animation_key, p_display_text, coalesce(p_priority, 100)
  )
  ON CONFLICT (game_id, normalized_event_id) DO UPDATE SET
    event_type = EXCLUDED.event_type,
    event_subtype = EXCLUDED.event_subtype,
    team_id = EXCLUDED.team_id,
    primary_player_id = EXCLUDED.primary_player_id,
    primary_player_name = EXCLUDED.primary_player_name,
    clock_display = EXCLUDED.clock_display,
    zone_key = EXCLUDED.zone_key,
    animation_key = EXCLUDED.animation_key,
    display_text = EXCLUDED.display_text,
    priority = EXCLUDED.priority,
    is_consumed = false,
    is_skipped = false,
    available_at = now(),
    consumed_at = NULL
  RETURNING id INTO v_id;

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

-- =====================================================
-- PHASE 9: trigger normalization
-- =====================================================
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

-- =====================================================
-- PHASE 10/11: views + derived metric functions in dependency order
-- =====================================================
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
FROM public.live_game_visual_state;

CREATE OR REPLACE VIEW public.v_latest_possession_signal AS
WITH possession_signals AS (
  SELECT
    e.game_id,
    e.id AS normalized_event_id,
    e.created_at,
    e.period_number,
    e.clock_display,
    e.clock_seconds_remaining,
    e.event_type,
    e.event_subtype,
    e.possession_result,
    e.possession_team_id_after,
    e.team_id,
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
  SELECT
    ps.*,
    row_number() OVER (
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
), scoring_events AS (
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
), windowed AS (
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
), last_scores AS (
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

-- =====================================================
-- PHASE 12: explicit RLS mode parity for system/internal watch tables
-- =====================================================
ALTER TABLE IF EXISTS public.normalized_pbp_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.live_game_visual_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visual_event_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_parser_errors DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.normalized_pbp_event_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_event_type_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_zone_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_animation_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_feature_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_feature_access DISABLE ROW LEVEL SECURITY;