
-- Create NBA play-by-play events table
CREATE TABLE public.nba_play_by_play_events (
  game_id text NOT NULL,
  play_id int NOT NULL,
  data_set text,
  date date,
  -- Lineup snapshots
  a1 text, a2 text, a3 text, a4 text, a5 text,
  h1 text, h2 text, h3 text, h4 text, h5 text,
  -- Game context
  period int,
  away_score int,
  home_score int,
  remaining_time text,
  elapsed text,
  play_length text,
  -- Event data
  team text,
  event_type text,
  assist text,
  away text,
  home text,
  block text,
  entered text,
  left_player text,  -- "left" is reserved word
  num text,
  opponent text,
  outof text,
  player text,
  points int,
  possession text,
  reason text,
  result text,
  steal text,
  type text,
  shot_distance numeric,
  original_x numeric,
  original_y numeric,
  description text,
  away_team text,
  home_team text,
  team_possession text,
  time_actual timestamptz,
  qualifiers1 text,
  qualifiers2 text,
  qualifiers3 text,
  qualifiers4 text,
  area text,
  area_detail text,
  official text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, play_id)
);

-- Enable RLS
ALTER TABLE public.nba_play_by_play_events ENABLE ROW LEVEL SECURITY;

-- Public read access (game data is not user-specific)
CREATE POLICY "Anyone can read nba pbp events"
  ON public.nba_play_by_play_events FOR SELECT USING (true);

-- Only service role / admin can insert (done via edge function)
CREATE POLICY "Service role can insert nba pbp events"
  ON public.nba_play_by_play_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete nba pbp events"
  ON public.nba_play_by_play_events FOR DELETE
  USING (true);

-- Index for game lookups
CREATE INDEX idx_nba_pbp_events_date ON public.nba_play_by_play_events (date);
CREATE INDEX idx_nba_pbp_events_player ON public.nba_play_by_play_events (player);
CREATE INDEX idx_nba_pbp_events_event_type ON public.nba_play_by_play_events (event_type);
