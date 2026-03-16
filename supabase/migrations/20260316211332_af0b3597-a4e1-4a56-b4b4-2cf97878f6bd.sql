-- 1. normalized_pbp_events table
CREATE TABLE IF NOT EXISTS public.normalized_pbp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL,
  source_event_id text,
  source_provider text,
  sport text DEFAULT 'NBA',
  league text DEFAULT 'NBA',
  period_number int,
  clock_display text,
  clock_seconds_remaining int,
  event_index int,
  sequence_number int,
  team_id text,
  opponent_team_id text,
  primary_player_id text,
  primary_player_name text,
  secondary_player_id text,
  secondary_player_name text,
  tertiary_player_id text,
  event_type text NOT NULL,
  event_subtype text,
  points_scored int DEFAULT 0,
  possession_result text,
  score_home_after int,
  score_away_after int,
  is_scoring_play boolean DEFAULT false,
  is_turnover boolean DEFAULT false,
  is_rebound boolean DEFAULT false,
  is_foul boolean DEFAULT false,
  is_timeout boolean DEFAULT false,
  is_substitution boolean DEFAULT false,
  zone_key text,
  animation_key text,
  raw_description text,
  parser_confidence numeric(4,3),
  parser_version text DEFAULT 'v1',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_norm_pbp_game_id ON public.normalized_pbp_events (game_id);
CREATE INDEX IF NOT EXISTS idx_norm_pbp_game_period ON public.normalized_pbp_events (game_id, period_number, event_index);
CREATE INDEX IF NOT EXISTS idx_norm_pbp_created ON public.normalized_pbp_events (created_at DESC);

-- 2. visual_event_queue table
CREATE TABLE IF NOT EXISTS public.visual_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL,
  normalized_event_id uuid REFERENCES public.normalized_pbp_events(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_subtype text,
  team_id text,
  primary_player_id text,
  primary_player_name text,
  clock_display text,
  zone_key text,
  animation_key text,
  display_text text,
  priority int DEFAULT 5,
  is_consumed boolean DEFAULT false,
  is_skipped boolean DEFAULT false,
  available_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_visual_event_queue_game_id ON public.visual_event_queue (game_id);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_consumption ON public.visual_event_queue (game_id, is_consumed, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_visual_event_queue_normalized_event_id ON public.visual_event_queue (normalized_event_id);

-- 3. RLS
ALTER TABLE public.normalized_pbp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "normalized_pbp_events_read" ON public.normalized_pbp_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "normalized_pbp_events_anon_read" ON public.normalized_pbp_events FOR SELECT TO anon USING (true);

ALTER TABLE public.visual_event_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visual_event_queue_read" ON public.visual_event_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "visual_event_queue_anon_read" ON public.visual_event_queue FOR SELECT TO anon USING (true);