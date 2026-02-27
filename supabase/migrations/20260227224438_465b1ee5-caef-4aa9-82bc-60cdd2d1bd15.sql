
-- ================================================
-- BallDontLie GOAT: Provider-safe NBA tables
-- ================================================

-- 1) provider_game_map — map internal game keys to provider IDs
CREATE TABLE IF NOT EXISTS public.provider_game_map (
  game_key uuid NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  provider text NOT NULL,
  provider_game_id text NOT NULL,
  game_date date,
  home_team_abbr text,
  away_team_abbr text,
  start_time_utc timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_pgm_league_provider_pid
  ON public.provider_game_map (league, provider, provider_game_id);
CREATE UNIQUE INDEX IF NOT EXISTS uix_pgm_gamekey_provider
  ON public.provider_game_map (game_key, provider);

ALTER TABLE public.provider_game_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on provider_game_map"
  ON public.provider_game_map FOR ALL
  USING (true) WITH CHECK (true);

-- 2) nba_pbp_events — provider-safe play-by-play
CREATE TABLE IF NOT EXISTS public.nba_pbp_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_key uuid NOT NULL,
  provider text NOT NULL DEFAULT 'balldontlie',
  provider_game_id text,
  provider_event_id text NOT NULL,
  period int NOT NULL,
  event_ts_game text,
  event_type text,
  description text,
  team_abbr text,
  player_id text,
  player_name text,
  home_score int,
  away_score int,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_nba_pbp_events_key
  ON public.nba_pbp_events (game_key, provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_nba_pbp_events_gamekey
  ON public.nba_pbp_events (game_key, period, created_at);

ALTER TABLE public.nba_pbp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on nba_pbp_events"
  ON public.nba_pbp_events FOR ALL
  USING (true) WITH CHECK (true);

-- 3) nba_game_odds — provider-safe betting odds
CREATE TABLE IF NOT EXISTS public.nba_game_odds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_key uuid NOT NULL,
  provider text NOT NULL DEFAULT 'balldontlie',
  vendor text NOT NULL,
  market text NOT NULL,
  home_line numeric,
  away_line numeric,
  total numeric,
  home_odds int,
  away_odds int,
  over_odds int,
  under_odds int,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_nba_game_odds_key
  ON public.nba_game_odds (game_key, provider, vendor, market);
CREATE INDEX IF NOT EXISTS idx_nba_game_odds_gamekey
  ON public.nba_game_odds (game_key);

ALTER TABLE public.nba_game_odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on nba_game_odds"
  ON public.nba_game_odds FOR ALL
  USING (true) WITH CHECK (true);

-- 4) nba_player_props_live — live player props
CREATE TABLE IF NOT EXISTS public.nba_player_props_live (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_key uuid NOT NULL,
  provider text NOT NULL DEFAULT 'balldontlie',
  vendor text NOT NULL,
  player_id text NOT NULL,
  player_name text,
  prop_type text NOT NULL,
  line_value numeric NOT NULL,
  market_type text NOT NULL DEFAULT 'over_under',
  over_odds int,
  under_odds int,
  odds int,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_nba_player_props_live_key
  ON public.nba_player_props_live (game_key, provider, vendor, player_id, prop_type, line_value, market_type);
CREATE INDEX IF NOT EXISTS idx_nba_player_props_live_gamekey
  ON public.nba_player_props_live (game_key);

ALTER TABLE public.nba_player_props_live ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on nba_player_props_live"
  ON public.nba_player_props_live FOR ALL
  USING (true) WITH CHECK (true);

-- 5) nba_player_props_archive — snapshot history
CREATE TABLE IF NOT EXISTS public.nba_player_props_archive (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_key uuid NOT NULL,
  provider text NOT NULL DEFAULT 'balldontlie',
  vendor text,
  player_id text,
  player_name text,
  prop_type text,
  line_value numeric,
  market_type text,
  over_odds int,
  under_odds int,
  odds int,
  snapshot_ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nba_player_props_archive_gamekey
  ON public.nba_player_props_archive (game_key, snapshot_ts);

ALTER TABLE public.nba_player_props_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on nba_player_props_archive"
  ON public.nba_player_props_archive FOR ALL
  USING (true) WITH CHECK (true);

-- Allow anon reads for UI components
CREATE POLICY "Anon read provider_game_map" ON public.provider_game_map FOR SELECT USING (true);
CREATE POLICY "Anon read nba_pbp_events" ON public.nba_pbp_events FOR SELECT USING (true);
CREATE POLICY "Anon read nba_game_odds" ON public.nba_game_odds FOR SELECT USING (true);
CREATE POLICY "Anon read nba_player_props_live" ON public.nba_player_props_live FOR SELECT USING (true);
CREATE POLICY "Anon read nba_player_props_archive" ON public.nba_player_props_archive FOR SELECT USING (true);
