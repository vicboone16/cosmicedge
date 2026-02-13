
-- ═══════════════════════════════════════════════
-- Phase 1: Injuries & Depth Charts
-- ═══════════════════════════════════════════════

CREATE TABLE public.injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  team_abbr text NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  status text, -- Out, Doubtful, Questionable, Probable
  body_part text,
  notes text,
  start_date date,
  external_player_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_name, team_abbr, league)
);

ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Injuries are publicly readable"
  ON public.injuries FOR SELECT USING (true);

CREATE TABLE public.depth_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_abbr text NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  position text NOT NULL,
  depth_order integer NOT NULL DEFAULT 1,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  external_player_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_abbr, league, position, depth_order)
);

ALTER TABLE public.depth_charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Depth charts are publicly readable"
  ON public.depth_charts FOR SELECT USING (true);

-- ═══════════════════════════════════════════════
-- Phase 2: Player Headshots
-- ═══════════════════════════════════════════════

-- Add headshot_url directly to players table
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS headshot_url text;

-- ═══════════════════════════════════════════════
-- Phase 3: SportsDataIO Game Lines (backup odds)
-- ═══════════════════════════════════════════════

CREATE TABLE public.sdio_game_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  external_game_id text,
  sportsbook text NOT NULL,
  market_type text NOT NULL, -- spread, moneyline, total
  home_line numeric,
  away_line numeric,
  home_price integer,
  away_price integer,
  over_price integer,
  under_price integer,
  is_live boolean NOT NULL DEFAULT false,
  league text NOT NULL DEFAULT 'NBA',
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(external_game_id, sportsbook, market_type, is_live)
);

ALTER TABLE public.sdio_game_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDIO game lines are publicly readable"
  ON public.sdio_game_lines FOR SELECT USING (true);

-- ═══════════════════════════════════════════════
-- Phase 4: Player News
-- ═══════════════════════════════════════════════

CREATE TABLE public.player_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_news_id integer UNIQUE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  player_name text,
  team_abbr text,
  league text NOT NULL DEFAULT 'NBA',
  title text,
  content text,
  source text,
  source_url text,
  categories text, -- e.g. 'Injuries,Lineup'
  is_breaking boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Player news is publicly readable"
  ON public.player_news FOR SELECT USING (true);

CREATE INDEX idx_player_news_published ON public.player_news (published_at DESC);
CREATE INDEX idx_player_news_team ON public.player_news (team_abbr, league);

-- ═══════════════════════════════════════════════
-- Phase 5: Projections
-- ═══════════════════════════════════════════════

CREATE TABLE public.player_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  team_abbr text NOT NULL,
  league text NOT NULL DEFAULT 'NBA',
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  game_date date NOT NULL,
  projected_minutes numeric,
  projected_points numeric,
  projected_rebounds numeric,
  projected_assists numeric,
  projected_steals numeric,
  projected_blocks numeric,
  projected_turnovers numeric,
  projected_three_made numeric,
  projected_fg_made numeric,
  projected_fg_attempted numeric,
  projected_ft_made numeric,
  projected_ft_attempted numeric,
  projected_fantasy_points numeric,
  salary integer,
  slate_id text,
  external_player_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_name, team_abbr, game_date, league)
);

ALTER TABLE public.player_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projections are publicly readable"
  ON public.player_projections FOR SELECT USING (true);

CREATE INDEX idx_projections_game_date ON public.player_projections (game_date, league);

-- Triggers for updated_at
CREATE TRIGGER update_injuries_updated_at BEFORE UPDATE ON public.injuries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_depth_charts_updated_at BEFORE UPDATE ON public.depth_charts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_player_news_updated_at BEFORE UPDATE ON public.player_news FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projections_updated_at BEFORE UPDATE ON public.player_projections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
