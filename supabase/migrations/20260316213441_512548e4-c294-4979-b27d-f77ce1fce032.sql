
-- Core visual state table for Watch mode
CREATE TABLE IF NOT EXISTS public.live_game_visual_state (
  game_id text PRIMARY KEY,
  home_team_id text,
  away_team_id text,
  home_score int DEFAULT 0,
  away_score int DEFAULT 0,
  period_number int DEFAULT 1,
  period_label text,
  clock_display text,
  clock_seconds_remaining int,
  possession_team_id text,
  possession_confidence numeric DEFAULT 0.35,
  last_event_id uuid,
  last_event_type text,
  last_event_subtype text,
  last_event_team_id text,
  last_event_player_name text,
  last_event_text text,
  last_source_event_id text,
  event_zone text,
  animation_key text,
  parser_version text,
  sync_latency_ms int,
  recent_run_home int DEFAULT 0,
  recent_run_away int DEFAULT 0,
  recent_scoring_drought_home_sec int,
  recent_scoring_drought_away_sec int,
  pace_estimate numeric,
  momentum_team_id text,
  momentum_score numeric DEFAULT 0,
  home_fouls_period int DEFAULT 0,
  away_fouls_period int DEFAULT 0,
  in_bonus_home boolean DEFAULT false,
  in_bonus_away boolean DEFAULT false,
  last_ingested_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.live_game_visual_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read visual state"
  ON public.live_game_visual_state FOR SELECT
  TO authenticated, anon
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_game_visual_state;
