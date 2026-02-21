
-- ============================================================
-- STEP 2: Canonical identity + mapping tables
-- ============================================================

-- A) cosmic_games — canonical game identity
CREATE TABLE public.cosmic_games (
  game_key uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league text NOT NULL,
  season text NULL,
  game_date date NOT NULL,
  start_time_utc timestamptz NULL,
  home_team_abbr text NOT NULL,
  away_team_abbr text NOT NULL,
  status text NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_cosmic_games_fingerprint
  ON public.cosmic_games (league, game_date, home_team_abbr, away_team_abbr);

-- B) cosmic_game_id_map — provider game id mapping
CREATE TABLE public.cosmic_game_id_map (
  provider text NOT NULL,
  provider_game_id text NOT NULL,
  league text NOT NULL,
  game_key uuid NOT NULL REFERENCES public.cosmic_games(game_key) ON DELETE CASCADE,
  confidence int NOT NULL,
  match_method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cosmic_game_id_map UNIQUE (provider, provider_game_id)
);

CREATE INDEX idx_cosmic_game_id_map_game_key ON public.cosmic_game_id_map(game_key);

-- C) cosmic_unmatched_games — holding tank
CREATE TABLE public.cosmic_unmatched_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_game_id text NULL,
  league text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cosmic_unmatched_provider ON public.cosmic_unmatched_games(provider, league);

-- ============================================================
-- STEP 3: pbpstats live data tables (provider-scoped)
-- ============================================================

-- D) pbp_live_games_by_provider
CREATE TABLE public.pbp_live_games_by_provider (
  provider text NOT NULL,
  provider_game_id text NOT NULL,
  league text NOT NULL,
  game_key uuid NULL REFERENCES public.cosmic_games(game_key) ON DELETE SET NULL,
  status text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pbp_live_games UNIQUE (provider, provider_game_id)
);

-- E) pbp_events — append-only event stream for realtime
CREATE TABLE public.pbp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key uuid NOT NULL REFERENCES public.cosmic_games(game_key) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_game_id text NOT NULL,
  provider_event_id text NOT NULL,
  period int NOT NULL,
  clock text NULL,
  home_score int NULL,
  away_score int NULL,
  team_abbr text NULL,
  player_name text NULL,
  player_id text NULL,
  event_type text NULL,
  description text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pbp_events_provider
  ON public.pbp_events (game_key, provider, provider_event_id);

CREATE INDEX idx_pbp_events_game_key ON public.pbp_events(game_key, created_at DESC);

-- F) pbp_quarter_team_stats
CREATE TABLE public.pbp_quarter_team_stats (
  game_key uuid NOT NULL REFERENCES public.cosmic_games(game_key) ON DELETE CASCADE,
  provider text NOT NULL,
  period int NOT NULL,
  team_abbr text NOT NULL,
  pts int NOT NULL DEFAULT 0,
  fgm int NOT NULL DEFAULT 0,
  fga int NOT NULL DEFAULT 0,
  fg3m int NOT NULL DEFAULT 0,
  fg3a int NOT NULL DEFAULT 0,
  ftm int NOT NULL DEFAULT 0,
  fta int NOT NULL DEFAULT 0,
  oreb int NOT NULL DEFAULT 0,
  dreb int NOT NULL DEFAULT 0,
  tov int NOT NULL DEFAULT 0,
  fouls int NOT NULL DEFAULT 0,
  last_provider_event_id text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pbp_qtr_team UNIQUE (game_key, provider, period, team_abbr)
);

-- G) pbp_quarter_player_stats
CREATE TABLE public.pbp_quarter_player_stats (
  game_key uuid NOT NULL REFERENCES public.cosmic_games(game_key) ON DELETE CASCADE,
  provider text NOT NULL,
  period int NOT NULL,
  team_abbr text NULL,
  player_id text NOT NULL,
  player_name text NOT NULL,
  pts int NOT NULL DEFAULT 0,
  fgm int NOT NULL DEFAULT 0,
  fga int NOT NULL DEFAULT 0,
  fg3m int NOT NULL DEFAULT 0,
  fg3a int NOT NULL DEFAULT 0,
  ftm int NOT NULL DEFAULT 0,
  fta int NOT NULL DEFAULT 0,
  reb int NOT NULL DEFAULT 0,
  ast int NOT NULL DEFAULT 0,
  stl int NOT NULL DEFAULT 0,
  blk int NOT NULL DEFAULT 0,
  tov int NOT NULL DEFAULT 0,
  pf int NOT NULL DEFAULT 0,
  last_provider_event_id text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pbp_qtr_player UNIQUE (game_key, provider, period, player_id)
);

-- ============================================================
-- Enable Realtime on the live feed tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.pbp_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pbp_quarter_team_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pbp_quarter_player_stats;

-- ============================================================
-- RLS: All new tables are public-read (no auth needed for reads)
-- Writes only via service_role from edge functions
-- ============================================================

ALTER TABLE public.cosmic_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cosmic_games" ON public.cosmic_games FOR SELECT USING (true);

ALTER TABLE public.cosmic_game_id_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cosmic_game_id_map" ON public.cosmic_game_id_map FOR SELECT USING (true);

ALTER TABLE public.cosmic_unmatched_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cosmic_unmatched_games" ON public.cosmic_unmatched_games FOR SELECT USING (true);

ALTER TABLE public.pbp_live_games_by_provider ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pbp_live_games" ON public.pbp_live_games_by_provider FOR SELECT USING (true);

ALTER TABLE public.pbp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pbp_events" ON public.pbp_events FOR SELECT USING (true);

ALTER TABLE public.pbp_quarter_team_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pbp_qtr_team" ON public.pbp_quarter_team_stats FOR SELECT USING (true);

ALTER TABLE public.pbp_quarter_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read pbp_qtr_player" ON public.pbp_quarter_player_stats FOR SELECT USING (true);
