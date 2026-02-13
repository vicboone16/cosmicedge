
-- =============================================
-- GEO / ASTRO LAYER
-- =============================================

CREATE TABLE public.stadiums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  state text,
  country text DEFAULT 'US',
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  team_abbr text,
  league text,
  capacity integer,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stadiums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stadiums are publicly readable" ON public.stadiums FOR SELECT USING (true);
CREATE INDEX idx_stadiums_team_abbr ON public.stadiums (team_abbr);
CREATE INDEX idx_stadiums_league ON public.stadiums (league);

-- =============================================
-- REFEREES
-- =============================================

CREATE TABLE public.referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  external_id text,
  league text,
  birth_date date,
  birth_time time,
  birth_place text,
  birth_lat double precision,
  birth_lng double precision,
  natal_data_quality text DEFAULT 'C',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referees are publicly readable" ON public.referees FOR SELECT USING (true);

CREATE TABLE public.game_referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.referees(id) ON DELETE CASCADE,
  role text DEFAULT 'crew_chief',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, referee_id)
);

ALTER TABLE public.game_referees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game referees are publicly readable" ON public.game_referees FOR SELECT USING (true);
CREATE INDEX idx_game_referees_game ON public.game_referees (game_id);

-- =============================================
-- GAME STATS LAYER
-- =============================================

CREATE TABLE public.player_game_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_abbr text NOT NULL,
  minutes integer,
  points integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  turnovers integer DEFAULT 0,
  fouls integer DEFAULT 0,
  fg_made integer DEFAULT 0,
  fg_attempted integer DEFAULT 0,
  three_made integer DEFAULT 0,
  three_attempted integer DEFAULT 0,
  ft_made integer DEFAULT 0,
  ft_attempted integer DEFAULT 0,
  off_rebounds integer DEFAULT 0,
  def_rebounds integer DEFAULT 0,
  plus_minus integer DEFAULT 0,
  fantasy_points double precision,
  starter boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);

ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player game stats are publicly readable" ON public.player_game_stats FOR SELECT USING (true);
CREATE INDEX idx_pgs_game ON public.player_game_stats (game_id);
CREATE INDEX idx_pgs_player ON public.player_game_stats (player_id);

CREATE TABLE public.team_game_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  team_abbr text NOT NULL,
  is_home boolean NOT NULL,
  points integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  turnovers integer DEFAULT 0,
  fg_made integer DEFAULT 0,
  fg_attempted integer DEFAULT 0,
  three_made integer DEFAULT 0,
  three_attempted integer DEFAULT 0,
  ft_made integer DEFAULT 0,
  ft_attempted integer DEFAULT 0,
  off_rebounds integer DEFAULT 0,
  def_rebounds integer DEFAULT 0,
  fast_break_points integer DEFAULT 0,
  points_in_paint integer DEFAULT 0,
  second_chance_points integer DEFAULT 0,
  bench_points integer DEFAULT 0,
  possessions double precision,
  pace double precision,
  off_rating double precision,
  def_rating double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, team_abbr)
);

ALTER TABLE public.team_game_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team game stats are publicly readable" ON public.team_game_stats FOR SELECT USING (true);
CREATE INDEX idx_tgs_game ON public.team_game_stats (game_id);

CREATE TABLE public.game_quarters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  quarter integer NOT NULL,
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, quarter)
);

ALTER TABLE public.game_quarters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game quarters are publicly readable" ON public.game_quarters FOR SELECT USING (true);

-- =============================================
-- SEASON STATS LAYER
-- =============================================

CREATE TABLE public.player_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  season integer NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  games_played integer DEFAULT 0,
  minutes_per_game double precision,
  points_per_game double precision,
  rebounds_per_game double precision,
  assists_per_game double precision,
  steals_per_game double precision,
  blocks_per_game double precision,
  turnovers_per_game double precision,
  fg_pct double precision,
  three_pct double precision,
  ft_pct double precision,
  usage_rate double precision,
  true_shooting_pct double precision,
  effective_fg_pct double precision,
  per double precision,
  win_shares double precision,
  bpm double precision,
  vorp double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season)
);

ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player season stats are publicly readable" ON public.player_season_stats FOR SELECT USING (true);
CREATE INDEX idx_pss_player ON public.player_season_stats (player_id);

CREATE TABLE public.team_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_abbr text NOT NULL,
  season integer NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  off_rating double precision,
  def_rating double precision,
  net_rating double precision,
  pace double precision,
  fg_pct double precision,
  three_pct double precision,
  ft_pct double precision,
  reb_pct double precision,
  ast_pct double precision,
  tov_pct double precision,
  opp_fg_pct double precision,
  opp_three_pct double precision,
  points_per_game double precision,
  opp_points_per_game double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_abbr, season)
);

ALTER TABLE public.team_season_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team season stats are publicly readable" ON public.team_season_stats FOR SELECT USING (true);

-- =============================================
-- PLAY-BY-PLAY
-- =============================================

CREATE TABLE public.play_by_play (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  quarter integer NOT NULL,
  clock text,
  event_type text NOT NULL,
  description text,
  team_abbr text,
  player_id uuid REFERENCES public.players(id),
  assist_player_id uuid REFERENCES public.players(id),
  home_score integer,
  away_score integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.play_by_play ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Play by play is publicly readable" ON public.play_by_play FOR SELECT USING (true);
CREATE INDEX idx_pbp_game ON public.play_by_play (game_id);
CREATE INDEX idx_pbp_player ON public.play_by_play (player_id);

-- =============================================
-- SPORTSBOOKS
-- =============================================

CREATE TABLE public.sportsbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  region text DEFAULT 'us',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sportsbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sportsbooks are publicly readable" ON public.sportsbooks FOR SELECT USING (true);

-- =============================================
-- ASTRO CALCULATIONS CACHE
-- =============================================

CREATE TABLE public.astro_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  calc_type text NOT NULL,
  calc_date date,
  location_lat double precision,
  location_lng double precision,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT 'astrovisor',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, calc_type, calc_date, location_lat, location_lng)
);

ALTER TABLE public.astro_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Astro calculations are publicly readable" ON public.astro_calculations FOR SELECT USING (true);
CREATE INDEX idx_astro_entity ON public.astro_calculations (entity_type, entity_id);
CREATE INDEX idx_astro_type ON public.astro_calculations (calc_type);

-- =============================================
-- TRIGGERS for updated_at
-- =============================================

CREATE TRIGGER update_stadiums_updated_at BEFORE UPDATE ON public.stadiums FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referees_updated_at BEFORE UPDATE ON public.referees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_player_season_stats_updated_at BEFORE UPDATE ON public.player_season_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_season_stats_updated_at BEFORE UPDATE ON public.team_season_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
