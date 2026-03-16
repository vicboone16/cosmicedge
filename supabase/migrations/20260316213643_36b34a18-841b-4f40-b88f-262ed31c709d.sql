
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_pbp_game_sequence
  ON public.normalized_pbp_events (game_id, period_number, sequence_number, event_index);

CREATE INDEX IF NOT EXISTS idx_pbp_game_team
  ON public.normalized_pbp_events (game_id, team_id);

CREATE INDEX IF NOT EXISTS idx_pbp_scoring
  ON public.normalized_pbp_events (game_id, is_scoring_play);

CREATE INDEX IF NOT EXISTS idx_pbp_event_type
  ON public.normalized_pbp_events (game_id, event_type);

CREATE INDEX IF NOT EXISTS idx_visual_state_game
  ON public.live_game_visual_state (game_id);
