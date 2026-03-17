BEGIN;

-- Dependency-safe type normalization for publish replay path.
DROP VIEW IF EXISTS public.v_game_watch_insights CASCADE;
DROP VIEW IF EXISTS public.v_game_watch_validation CASCADE;
DROP VIEW IF EXISTS public.v_game_watch_debug CASCADE;

ALTER TABLE IF EXISTS public.live_game_visual_state
  ALTER COLUMN possession_confidence TYPE numeric(5,4)
  USING CASE
    WHEN possession_confidence IS NULL THEN NULL
    ELSE round(possession_confidence::numeric, 4)
  END;

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

ALTER VIEW public.v_game_watch_debug RESET (security_invoker);

COMMIT;