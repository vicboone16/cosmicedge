
-- ═══════════════════════════════════════════════════════════════
-- NFL Data Warehouse Schema
-- ═══════════════════════════════════════════════════════════════

-- 1) API Fetch Log (cache-first design)
CREATE TABLE IF NOT EXISTS public.api_fetch_log (
  fetch_key text PRIMARY KEY,
  endpoint text NOT NULL,
  params_json jsonb NOT NULL DEFAULT '{}',
  last_http_status integer,
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_fetch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_fetch_log service role only" ON public.api_fetch_log FOR ALL USING (auth.role() = 'service_role');

-- 2) NFL Games
CREATE TABLE IF NOT EXISTS public.nfl_games (
  game_id text PRIMARY KEY,
  season_year integer NOT NULL,
  season_type text,
  week integer,
  round text,
  event_name text,
  status text,
  game_time timestamptz,
  home_team_id text,
  away_team_id text,
  home_team_name text,
  away_team_name text,
  home_score integer,
  away_score integer,
  arena text,
  city text,
  state text,
  country text,
  latitude double precision,
  longitude double precision,
  postal_code text,
  dome boolean,
  field text,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nfl_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfl_games publicly readable" ON public.nfl_games FOR SELECT USING (true);
CREATE INDEX idx_nfl_games_season ON public.nfl_games (season_year, week);
CREATE INDEX idx_nfl_games_status ON public.nfl_games (status);
CREATE INDEX idx_nfl_games_time ON public.nfl_games (game_time);

-- 3) NFL Injuries
CREATE TABLE IF NOT EXISTS public.nfl_injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text,
  player_id text NOT NULL,
  player_name text NOT NULL,
  injury text NOT NULL,
  returns text,
  date_injured date,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, date_injured, injury)
);
ALTER TABLE public.nfl_injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfl_injuries publicly readable" ON public.nfl_injuries FOR SELECT USING (true);
CREATE INDEX idx_nfl_injuries_player ON public.nfl_injuries (player_id);

-- 4) NFL Play-by-Play
CREATE TABLE IF NOT EXISTS public.nfl_play_by_play (
  game_id text NOT NULL REFERENCES public.nfl_games(game_id),
  sequence integer NOT NULL,
  event text,
  quarter integer,
  down integer,
  yards_to_go integer,
  yard_line text,
  game_clock text,
  possession_abbr text,
  is_scoring_play boolean DEFAULT false,
  is_touchdown boolean DEFAULT false,
  is_blocked boolean DEFAULT false,
  is_returned boolean DEFAULT false,
  is_recovered boolean DEFAULT false,
  details_json jsonb DEFAULT '{}',
  raw_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, sequence)
);
ALTER TABLE public.nfl_play_by_play ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfl_play_by_play publicly readable" ON public.nfl_play_by_play FOR SELECT USING (true);
CREATE INDEX idx_nfl_pbp_quarter ON public.nfl_play_by_play (game_id, quarter);

-- 5) NFL Play-by-Play Players
CREATE TABLE IF NOT EXISTS public.nfl_play_by_play_players (
  game_id text NOT NULL,
  sequence integer NOT NULL,
  player_id text NOT NULL,
  player_name text,
  role text NOT NULL,
  action text,
  position text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, sequence, player_id, role),
  FOREIGN KEY (game_id, sequence) REFERENCES public.nfl_play_by_play(game_id, sequence)
);
ALTER TABLE public.nfl_play_by_play_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfl_pbp_players publicly readable" ON public.nfl_play_by_play_players FOR SELECT USING (true);
CREATE INDEX idx_nfl_pbp_players_player ON public.nfl_play_by_play_players (player_id);

-- 6) NFL Player Game Stats
CREATE TABLE IF NOT EXISTS public.nfl_player_game_stats (
  game_id text NOT NULL REFERENCES public.nfl_games(game_id),
  player_id text NOT NULL,
  player_name text,
  team_abbr text,
  targets integer DEFAULT 0,
  receptions integer DEFAULT 0,
  receiving_yards integer DEFAULT 0,
  receiving_tds integer DEFAULT 0,
  receiving_first_downs integer DEFAULT 0,
  longest_reception integer DEFAULT 0,
  rush_attempts integer DEFAULT 0,
  rushing_yards integer DEFAULT 0,
  rushing_tds integer DEFAULT 0,
  rushing_first_downs integer DEFAULT 0,
  longest_rush integer DEFAULT 0,
  passing_yards integer DEFAULT 0,
  interceptions integer DEFAULT 0,
  passing_attempts integer DEFAULT 0,
  completions integer DEFAULT 0,
  passing_tds integer DEFAULT 0,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);
ALTER TABLE public.nfl_player_game_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfl_player_game_stats publicly readable" ON public.nfl_player_game_stats FOR SELECT USING (true);
CREATE INDEX idx_nfl_pgs_player ON public.nfl_player_game_stats (player_id);
CREATE INDEX idx_nfl_pgs_team ON public.nfl_player_game_stats (team_abbr);

-- 7) Computed metrics view (with divide-by-zero protection)
CREATE OR REPLACE VIEW public.v_nfl_player_game_metrics AS
SELECT
  s.*,
  -- Receiving
  CASE WHEN s.receptions > 0 THEN ROUND(s.receiving_yards::numeric / s.receptions, 1) ELSE 0 END AS receiving_yards_per_reception,
  CASE WHEN s.targets > 0 THEN ROUND(s.receptions::numeric / s.targets * 100, 1) ELSE 0 END AS catch_percentage,
  CASE WHEN s.targets > 0 THEN ROUND(s.receiving_yards::numeric / s.targets, 1) ELSE 0 END AS receiving_yards_per_target,
  -- Rushing
  CASE WHEN s.rush_attempts > 0 THEN ROUND(s.rushing_yards::numeric / s.rush_attempts, 1) ELSE 0 END AS rushing_yards_per_attempt,
  -- Combined
  (s.rushing_tds + s.receiving_tds) AS rush_rec_tds,
  (s.rushing_yards + s.receiving_yards) AS rush_rec_yards,
  -- Game context
  g.season_year,
  g.week,
  g.home_team_name,
  g.away_team_name,
  g.game_time
FROM public.nfl_player_game_stats s
JOIN public.nfl_games g ON g.game_id = s.game_id;

-- 8) Quarter-level metrics view
CREATE OR REPLACE VIEW public.v_nfl_player_quarter_metrics AS
SELECT
  pp.game_id,
  pp.quarter,
  ppl.player_id,
  ppl.player_name,
  pp.possession_abbr AS team_abbr,
  COUNT(*) AS total_plays,
  COUNT(*) FILTER (WHERE pp.is_scoring_play) AS scoring_plays,
  COUNT(*) FILTER (WHERE pp.is_touchdown) AS touchdowns
FROM public.nfl_play_by_play pp
JOIN public.nfl_play_by_play_players ppl ON pp.game_id = ppl.game_id AND pp.sequence = ppl.sequence
GROUP BY pp.game_id, pp.quarter, ppl.player_id, ppl.player_name, pp.possession_abbr;

-- Trigger for updated_at on nfl_games
CREATE TRIGGER update_nfl_games_updated_at
BEFORE UPDATE ON public.nfl_games
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on nfl_injuries
CREATE TRIGGER update_nfl_injuries_updated_at
BEFORE UPDATE ON public.nfl_injuries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on nfl_player_game_stats
CREATE TRIGGER update_nfl_player_game_stats_updated_at
BEFORE UPDATE ON public.nfl_player_game_stats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
