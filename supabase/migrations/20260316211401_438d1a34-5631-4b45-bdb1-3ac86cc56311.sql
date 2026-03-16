-- View: latest normalized PBP events
CREATE OR REPLACE VIEW public.v_latest_normalized_pbp_events AS
SELECT
  e.id, e.game_id, e.source_event_id, e.source_provider, e.sport, e.league,
  e.period_number, e.clock_display, e.event_index, e.sequence_number,
  e.team_id, e.primary_player_name, e.secondary_player_name,
  e.event_type, e.event_subtype, e.points_scored, e.possession_result,
  e.score_home_after, e.score_away_after, e.zone_key, e.animation_key,
  e.raw_description, e.parser_confidence, e.parser_version, e.created_at
FROM public.normalized_pbp_events e
ORDER BY e.created_at DESC;

-- Function: get next visual event
CREATE OR REPLACE FUNCTION public.get_next_visual_event(p_game_id text)
RETURNS TABLE (
  id uuid, game_id text, normalized_event_id uuid, event_type text,
  event_subtype text, team_id text, primary_player_id text,
  primary_player_name text, clock_display text, zone_key text,
  animation_key text, display_text text, priority int,
  available_at timestamptz, created_at timestamptz
)
LANGUAGE sql AS $$
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