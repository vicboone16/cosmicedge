BEGIN;

-- Create missing parity tables
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_feature_access_user_feature_unique UNIQUE(user_id, feature_key)
);
CREATE TABLE IF NOT EXISTS public.normalized_pbp_event_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_event_id uuid NOT NULL,
  tag_key text NOT NULL,
  tag_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normalize base tables
ALTER TABLE IF EXISTS public.normalized_pbp_events
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS normalized_description text,
  ADD COLUMN IF NOT EXISTS primary_player_name text,
  ADD COLUMN IF NOT EXISTS secondary_player_name text,
  ALTER COLUMN sport DROP DEFAULT,
  ALTER COLUMN league DROP DEFAULT,
  ALTER COLUMN parser_version DROP DEFAULT,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE IF EXISTS public.live_game_visual_state
  ADD COLUMN IF NOT EXISTS sport text,
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS last_event_player_id text,
  ADD COLUMN IF NOT EXISTS last_event_points integer,
  ADD COLUMN IF NOT EXISTS animation_status text,
  ADD COLUMN IF NOT EXISTS visual_mode_enabled boolean,
  ADD COLUMN IF NOT EXISTS source_provider text;

UPDATE public.live_game_visual_state
SET home_score = COALESCE(home_score,0),
    away_score = COALESCE(away_score,0),
    last_event_points = COALESCE(last_event_points,0),
    recent_run_home = COALESCE(recent_run_home,0),
    recent_run_away = COALESCE(recent_run_away,0),
    in_bonus_home = COALESCE(in_bonus_home,false),
    in_bonus_away = COALESCE(in_bonus_away,false),
    home_fouls_period = COALESCE(home_fouls_period,0),
    away_fouls_period = COALESCE(away_fouls_period,0),
    visual_mode_enabled = COALESCE(visual_mode_enabled,true),
    updated_at = COALESCE(updated_at,now());

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
  ALTER COLUMN updated_at SET DEFAULT now(),
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
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE IF EXISTS public.visual_event_queue
  ADD COLUMN IF NOT EXISTS primary_player_name text;

UPDATE public.visual_event_queue
SET priority = COALESCE(priority,100),
    is_skipped = COALESCE(is_skipped,false),
    available_at = COALESCE(available_at,now());

ALTER TABLE IF EXISTS public.visual_event_queue
  ALTER COLUMN priority SET DEFAULT 100,
  ALTER COLUMN is_skipped SET DEFAULT false,
  ALTER COLUMN available_at SET DEFAULT now(),
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN is_skipped SET NOT NULL,
  ALTER COLUMN available_at SET NOT NULL;

ALTER TABLE IF EXISTS public.pbp_parser_errors
  ALTER COLUMN error_stage DROP NOT NULL;

-- Constraints/FKs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='admin_feature_access_feature_key_fkey' AND conrelid='public.admin_feature_access'::regclass) THEN
    ALTER TABLE public.admin_feature_access ADD CONSTRAINT admin_feature_access_feature_key_fkey FOREIGN KEY (feature_key) REFERENCES public.app_feature_flags(key) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_event_tags_normalized_event_id_fkey' AND conrelid='public.normalized_pbp_event_tags'::regclass) THEN
    ALTER TABLE public.normalized_pbp_event_tags ADD CONSTRAINT normalized_pbp_event_tags_normalized_event_id_fkey FOREIGN KEY (normalized_event_id) REFERENCES public.normalized_pbp_events(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_events_event_type_fk' AND conrelid='public.normalized_pbp_events'::regclass) THEN
    ALTER TABLE public.normalized_pbp_events ADD CONSTRAINT normalized_pbp_events_event_type_fk FOREIGN KEY (event_type) REFERENCES public.pbp_event_type_catalog(event_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_events_zone_fk' AND conrelid='public.normalized_pbp_events'::regclass) THEN
    ALTER TABLE public.normalized_pbp_events ADD CONSTRAINT normalized_pbp_events_zone_fk FOREIGN KEY (zone_key) REFERENCES public.pbp_zone_catalog(zone_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_events_animation_fk' AND conrelid='public.normalized_pbp_events'::regclass) THEN
    ALTER TABLE public.normalized_pbp_events ADD CONSTRAINT normalized_pbp_events_animation_fk FOREIGN KEY (animation_key) REFERENCES public.pbp_animation_catalog(animation_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_events_points_scored_check' AND conrelid='public.normalized_pbp_events'::regclass) THEN
    ALTER TABLE public.normalized_pbp_events ADD CONSTRAINT normalized_pbp_events_points_scored_check CHECK (points_scored >= 0 AND points_scored <= 4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='normalized_pbp_events_parser_confidence_check' AND conrelid='public.normalized_pbp_events'::regclass) THEN
    ALTER TABLE public.normalized_pbp_events ADD CONSTRAINT normalized_pbp_events_parser_confidence_check CHECK (parser_confidence IS NULL OR (parser_confidence >= 0 AND parser_confidence <= 1));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_game_visual_state_last_event_id_fkey' AND conrelid='public.live_game_visual_state'::regclass) THEN
    ALTER TABLE public.live_game_visual_state ADD CONSTRAINT live_game_visual_state_last_event_id_fkey FOREIGN KEY (last_event_id) REFERENCES public.normalized_pbp_events(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_game_visual_state_event_zone_fk' AND conrelid='public.live_game_visual_state'::regclass) THEN
    ALTER TABLE public.live_game_visual_state ADD CONSTRAINT live_game_visual_state_event_zone_fk FOREIGN KEY (event_zone) REFERENCES public.pbp_zone_catalog(zone_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_game_visual_state_animation_fk' AND conrelid='public.live_game_visual_state'::regclass) THEN
    ALTER TABLE public.live_game_visual_state ADD CONSTRAINT live_game_visual_state_animation_fk FOREIGN KEY (animation_key) REFERENCES public.pbp_animation_catalog(animation_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='live_game_visual_state_possession_confidence_check' AND conrelid='public.live_game_visual_state'::regclass) THEN
    ALTER TABLE public.live_game_visual_state ADD CONSTRAINT live_game_visual_state_possession_confidence_check CHECK (possession_confidence IS NULL OR (possession_confidence >= 0 AND possession_confidence <= 1));
  END IF;
END $$;

-- Index normalization
DROP INDEX IF EXISTS public.idx_visual_state_game;
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_last_event_id ON public.live_game_visual_state(last_event_id);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_status ON public.live_game_visual_state(status);
CREATE INDEX IF NOT EXISTS idx_live_game_visual_state_updated_at ON public.live_game_visual_state(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_source_event_unique ON public.normalized_pbp_events(game_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_created_at ON public.normalized_pbp_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_event_type ON public.normalized_pbp_events(event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_created_at ON public.normalized_pbp_events(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_id ON public.normalized_pbp_events(game_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_game_sequence ON public.normalized_pbp_events(game_id, period_number, sequence_number, event_index);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_primary_player_id ON public.normalized_pbp_events(primary_player_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_events_team_id ON public.normalized_pbp_events(team_id);
CREATE INDEX IF NOT EXISTS idx_pbp_parser_errors_game_id ON public.pbp_parser_errors(game_id);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_consumption ON public.visual_event_queue(game_id, is_consumed, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_id ON public.visual_event_queue(game_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_event_queue_game_normalized_event_unique ON public.visual_event_queue(game_id, normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_event_id ON public.normalized_pbp_event_tags(normalized_event_id);
CREATE INDEX IF NOT EXISTS idx_normalized_pbp_event_tags_tag_key ON public.normalized_pbp_event_tags(tag_key);
CREATE INDEX IF NOT EXISTS idx_admin_feature_access_feature_key ON public.admin_feature_access(feature_key);
CREATE INDEX IF NOT EXISTS idx_admin_feature_access_user_id ON public.admin_feature_access(user_id);

-- Seeds
INSERT INTO public.pbp_event_type_catalog(event_type, description) VALUES
('assist','Assist'),('block','Block'),('ejection','Ejection'),('foul_loose_ball','Loose ball foul'),('foul_offensive','Offensive foul'),('foul_personal','Personal foul'),('foul_shooting','Shooting foul'),('foul_technical','Technical foul'),('free_throw_made','Made free throw'),('free_throw_missed','Missed free throw'),('injury_stoppage','Injury stoppage'),('jump_ball','Jump ball'),('made_shot','Made field goal'),('missed_shot','Missed field goal'),('period_end','End of period'),('period_start','Start of period'),('rebound_defensive','Defensive rebound'),('rebound_offensive','Offensive rebound'),('review','Official review'),('steal','Steal'),('substitution','Substitution'),('timeout','Timeout'),('turnover','Turnover'),('unknown','Unknown / unparsed'),('violation','Violation')
ON CONFLICT (event_type) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.pbp_zone_catalog(zone_key, description) VALUES
('backcourt','Backcourt'),('bench','Bench area'),('corner_3_left','Left corner three'),('corner_3_right','Right corner three'),('free_throw_line','Free throw line'),('midrange_center','Center midrange'),('midrange_left','Left midrange'),('midrange_right','Right midrange'),('paint','Paint area'),('restricted_area','Restricted area'),('sideline','Sideline'),('top_3','Top of key three'),('unknown','Unknown zone'),('wing_3_left','Left wing three'),('wing_3_right','Right wing three')
ON CONFLICT (zone_key) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.pbp_animation_catalog(animation_key, description) VALUES
('def_rebound_secure','Defensive rebound secure'),('dunk_finish','Dunk finish animation'),('foul_whistle','Foul whistle animation'),('free_throw_make','Made free throw animation'),('free_throw_miss','Missed free throw animation'),('jump_ball_start','Jump ball start'),('layup_finish','Layup finish animation'),('made_2_basic','Basic made 2-point animation'),('made_3_basic','Basic made 3-point animation'),('miss_2_basic','Missed 2-point animation'),('miss_3_basic','Missed 3-point animation'),('off_rebound_reset','Offensive rebound reset'),('period_end_freeze','Period end freeze'),('period_start_reset','Period start reset'),('review_pause','Review pause state'),('steal_flip','Steal possession flip'),('sub_bench_swap','Substitution bench swap'),('timeout_pause','Timeout pause state'),('turnover_flip','Turnover possession flip'),('unknown','No reliable animation')
ON CONFLICT (animation_key) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.app_feature_flags(key, description, is_enabled, config)
VALUES ('enable_pbp_watch_mode','Enables admin-only Play-by-Play Watch mode', true, '{"admin_only": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,is_enabled=EXCLUDED.is_enabled,config=EXCLUDED.config,updated_at=now();

-- Canonical function parity
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.consume_visual_event(p_queue_id uuid)
RETURNS void LANGUAGE plpgsql AS $$ begin update public.visual_event_queue set is_consumed=true, consumed_at=now() where id=p_queue_id; end; $$;
CREATE OR REPLACE FUNCTION public.enqueue_visual_event(p_game_id text, p_normalized_event_id uuid, p_event_type text, p_event_subtype text DEFAULT NULL::text, p_team_id text DEFAULT NULL::text, p_primary_player_id text DEFAULT NULL::text, p_primary_player_name text DEFAULT NULL::text, p_clock_display text DEFAULT NULL::text, p_zone_key text DEFAULT NULL::text, p_animation_key text DEFAULT NULL::text, p_display_text text DEFAULT NULL::text, p_priority integer DEFAULT 100)
RETURNS uuid LANGUAGE plpgsql AS $$ declare v_id uuid; begin insert into public.visual_event_queue (game_id,normalized_event_id,event_type,event_subtype,team_id,primary_player_id,primary_player_name,clock_display,zone_key,animation_key,display_text,priority) values (p_game_id,p_normalized_event_id,p_event_type,p_event_subtype,p_team_id,p_primary_player_id,p_primary_player_name,p_clock_display,p_zone_key,p_animation_key,p_display_text,coalesce(p_priority,100)) returning id into v_id; return v_id; end; $$;

DO $$ DECLARE fn text; BEGIN FOR fn IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_live_game_visual_state' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s;', fn); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.upsert_live_game_visual_state(p_game_id text, p_sport text DEFAULT NULL::text, p_league text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_home_team_id text DEFAULT NULL::text, p_away_team_id text DEFAULT NULL::text, p_period_number integer DEFAULT NULL::integer, p_period_label text DEFAULT NULL::text, p_clock_display text DEFAULT NULL::text, p_clock_seconds_remaining integer DEFAULT NULL::integer, p_home_score integer DEFAULT NULL::integer, p_away_score integer DEFAULT NULL::integer, p_possession_team_id text DEFAULT NULL::text, p_possession_confidence numeric DEFAULT NULL::numeric, p_last_event_id uuid DEFAULT NULL::uuid, p_last_event_type text DEFAULT NULL::text, p_last_event_subtype text DEFAULT NULL::text, p_last_event_team_id text DEFAULT NULL::text, p_last_event_player_id text DEFAULT NULL::text, p_last_event_player_name text DEFAULT NULL::text, p_last_event_text text DEFAULT NULL::text, p_last_event_points integer DEFAULT NULL::integer, p_event_zone text DEFAULT NULL::text, p_animation_key text DEFAULT NULL::text, p_animation_status text DEFAULT NULL::text, p_momentum_team_id text DEFAULT NULL::text, p_momentum_score numeric DEFAULT NULL::numeric, p_recent_run_home integer DEFAULT NULL::integer, p_recent_run_away integer DEFAULT NULL::integer, p_recent_scoring_drought_home_sec integer DEFAULT NULL::integer, p_recent_scoring_drought_away_sec integer DEFAULT NULL::integer, p_pace_estimate numeric DEFAULT NULL::numeric, p_in_bonus_home boolean DEFAULT NULL::boolean, p_in_bonus_away boolean DEFAULT NULL::boolean, p_home_fouls_period integer DEFAULT NULL::integer, p_away_fouls_period integer DEFAULT NULL::integer, p_sync_latency_ms integer DEFAULT NULL::integer, p_visual_mode_enabled boolean DEFAULT NULL::boolean, p_parser_version text DEFAULT NULL::text, p_source_provider text DEFAULT NULL::text, p_last_source_event_id text DEFAULT NULL::text, p_last_ingested_at timestamp with time zone DEFAULT now())
RETURNS void LANGUAGE plpgsql AS $$ begin insert into public.live_game_visual_state (game_id,sport,league,status,home_team_id,away_team_id,period_number,period_label,clock_display,clock_seconds_remaining,home_score,away_score,possession_team_id,possession_confidence,last_event_id,last_event_type,last_event_subtype,last_event_team_id,last_event_player_id,last_event_player_name,last_event_text,last_event_points,event_zone,animation_key,animation_status,momentum_team_id,momentum_score,recent_run_home,recent_run_away,recent_scoring_drought_home_sec,recent_scoring_drought_away_sec,pace_estimate,in_bonus_home,in_bonus_away,home_fouls_period,away_fouls_period,sync_latency_ms,visual_mode_enabled,parser_version,source_provider,last_source_event_id,last_ingested_at) values (p_game_id,p_sport,p_league,p_status,p_home_team_id,p_away_team_id,p_period_number,p_period_label,p_clock_display,p_clock_seconds_remaining,coalesce(p_home_score,0),coalesce(p_away_score,0),p_possession_team_id,p_possession_confidence,p_last_event_id,p_last_event_type,p_last_event_subtype,p_last_event_team_id,p_last_event_player_id,p_last_event_player_name,p_last_event_text,coalesce(p_last_event_points,0),p_event_zone,p_animation_key,p_animation_status,p_momentum_team_id,p_momentum_score,coalesce(p_recent_run_home,0),coalesce(p_recent_run_away,0),p_recent_scoring_drought_home_sec,p_recent_scoring_drought_away_sec,p_pace_estimate,coalesce(p_in_bonus_home,false),coalesce(p_in_bonus_away,false),coalesce(p_home_fouls_period,0),coalesce(p_away_fouls_period,0),p_sync_latency_ms,coalesce(p_visual_mode_enabled,true),p_parser_version,p_source_provider,p_last_source_event_id,coalesce(p_last_ingested_at,now())) on conflict (game_id) do update set sport=coalesce(excluded.sport,live_game_visual_state.sport),league=coalesce(excluded.league,live_game_visual_state.league),status=coalesce(excluded.status,live_game_visual_state.status),home_team_id=coalesce(excluded.home_team_id,live_game_visual_state.home_team_id),away_team_id=coalesce(excluded.away_team_id,live_game_visual_state.away_team_id),period_number=coalesce(excluded.period_number,live_game_visual_state.period_number),period_label=coalesce(excluded.period_label,live_game_visual_state.period_label),clock_display=coalesce(excluded.clock_display,live_game_visual_state.clock_display),clock_seconds_remaining=coalesce(excluded.clock_seconds_remaining,live_game_visual_state.clock_seconds_remaining),home_score=coalesce(excluded.home_score,live_game_visual_state.home_score),away_score=coalesce(excluded.away_score,live_game_visual_state.away_score),possession_team_id=coalesce(excluded.possession_team_id,live_game_visual_state.possession_team_id),possession_confidence=coalesce(excluded.possession_confidence,live_game_visual_state.possession_confidence),last_event_id=coalesce(excluded.last_event_id,live_game_visual_state.last_event_id),last_event_type=coalesce(excluded.last_event_type,live_game_visual_state.last_event_type),last_event_subtype=coalesce(excluded.last_event_subtype,live_game_visual_state.last_event_subtype),last_event_team_id=coalesce(excluded.last_event_team_id,live_game_visual_state.last_event_team_id),last_event_player_id=coalesce(excluded.last_event_player_id,live_game_visual_state.last_event_player_id),last_event_player_name=coalesce(excluded.last_event_player_name,live_game_visual_state.last_event_player_name),last_event_text=coalesce(excluded.last_event_text,live_game_visual_state.last_event_text),last_event_points=coalesce(excluded.last_event_points,live_game_visual_state.last_event_points),event_zone=coalesce(excluded.event_zone,live_game_visual_state.event_zone),animation_key=coalesce(excluded.animation_key,live_game_visual_state.animation_key),animation_status=coalesce(excluded.animation_status,live_game_visual_state.animation_status),momentum_team_id=coalesce(excluded.momentum_team_id,live_game_visual_state.momentum_team_id),momentum_score=coalesce(excluded.momentum_score,live_game_visual_state.momentum_score),recent_run_home=coalesce(excluded.recent_run_home,live_game_visual_state.recent_run_home),recent_run_away=coalesce(excluded.recent_run_away,live_game_visual_state.recent_run_away),recent_scoring_drought_home_sec=coalesce(excluded.recent_scoring_drought_home_sec,live_game_visual_state.recent_scoring_drought_home_sec),recent_scoring_drought_away_sec=coalesce(excluded.recent_scoring_drought_away_sec,live_game_visual_state.recent_scoring_drought_away_sec),pace_estimate=coalesce(excluded.pace_estimate,live_game_visual_state.pace_estimate),in_bonus_home=coalesce(excluded.in_bonus_home,live_game_visual_state.in_bonus_home),in_bonus_away=coalesce(excluded.in_bonus_away,live_game_visual_state.in_bonus_away),home_fouls_period=coalesce(excluded.home_fouls_period,live_game_visual_state.home_fouls_period),away_fouls_period=coalesce(excluded.away_fouls_period,live_game_visual_state.away_fouls_period),sync_latency_ms=coalesce(excluded.sync_latency_ms,live_game_visual_state.sync_latency_ms),visual_mode_enabled=coalesce(excluded.visual_mode_enabled,live_game_visual_state.visual_mode_enabled),parser_version=coalesce(excluded.parser_version,live_game_visual_state.parser_version),source_provider=coalesce(excluded.source_provider,live_game_visual_state.source_provider),last_source_event_id=coalesce(excluded.last_source_event_id,live_game_visual_state.last_source_event_id),last_ingested_at=coalesce(excluded.last_ingested_at,live_game_visual_state.last_ingested_at),updated_at=now(); end; $$;

-- Trigger parity
DROP TRIGGER IF EXISTS trg_normalized_pbp_events_updated_at ON public.normalized_pbp_events;
DROP TRIGGER IF EXISTS trg_live_game_visual_state_updated_at ON public.live_game_visual_state;
DROP TRIGGER IF EXISTS trg_app_feature_flags_updated_at ON public.app_feature_flags;
DROP TRIGGER IF EXISTS trg_admin_feature_access_updated_at ON public.admin_feature_access;
CREATE TRIGGER trg_normalized_pbp_events_updated_at BEFORE UPDATE ON public.normalized_pbp_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_live_game_visual_state_updated_at BEFORE UPDATE ON public.live_game_visual_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_app_feature_flags_updated_at BEFORE UPDATE ON public.app_feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_admin_feature_access_updated_at BEFORE UPDATE ON public.admin_feature_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Canonical views
CREATE OR REPLACE VIEW public.v_latest_normalized_pbp_events AS
SELECT id, game_id, source_event_id, source_provider, sport, league, period_number, clock_display, event_index, sequence_number, team_id, primary_player_name, secondary_player_name, event_type, event_subtype, points_scored, possession_result, score_home_after, score_away_after, zone_key, animation_key, raw_description, parser_confidence, parser_version, created_at
FROM public.normalized_pbp_events
ORDER BY created_at DESC;
CREATE OR REPLACE VIEW public.v_game_watch_debug AS
SELECT game_id, status, period_number, period_label, clock_display, home_team_id, away_team_id, home_score, away_score, possession_team_id, possession_confidence, last_event_id, last_event_type, last_event_subtype, last_event_player_name, last_event_text, event_zone, animation_key, sync_latency_ms, parser_version, source_provider, last_source_event_id, last_ingested_at, updated_at
FROM public.live_game_visual_state;
ALTER VIEW public.v_latest_normalized_pbp_events RESET (security_invoker);
ALTER VIEW public.v_game_watch_debug RESET (security_invoker);

-- Disable RLS + drop policies for parity
DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('normalized_pbp_events','live_game_visual_state','visual_event_queue','pbp_parser_errors','app_feature_flags','admin_feature_access','normalized_pbp_event_tags','pbp_event_type_catalog','pbp_zone_catalog','pbp_animation_catalog') LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename); END LOOP; END $$;
ALTER TABLE IF EXISTS public.normalized_pbp_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.live_game_visual_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visual_event_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_parser_errors DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_feature_flags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_feature_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.normalized_pbp_event_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_event_type_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_zone_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pbp_animation_catalog DISABLE ROW LEVEL SECURITY;

COMMIT;