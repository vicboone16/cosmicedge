
-- Create standings table for team rankings from SportsDataIO
CREATE TABLE public.standings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league TEXT NOT NULL,
  season INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  team_abbr TEXT NOT NULL,
  conference TEXT,
  division TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER DEFAULT 0,
  overtime_losses INTEGER DEFAULT 0,
  win_pct NUMERIC(5,3) DEFAULT 0,
  games_back NUMERIC(5,1) DEFAULT 0,
  streak TEXT,
  last_10 TEXT,
  home_record TEXT,
  away_record TEXT,
  points_for INTEGER DEFAULT 0,
  points_against INTEGER DEFAULT 0,
  net_points INTEGER DEFAULT 0,
  playoff_seed INTEGER,
  clinched TEXT,
  external_team_id TEXT,
  provider TEXT NOT NULL DEFAULT 'sportsdataio',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(league, season, team_name, provider)
);

-- Enable RLS
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;

-- Standings are public read
CREATE POLICY "Standings are viewable by everyone"
ON public.standings
FOR SELECT
USING (true);

-- Create index for common queries
CREATE INDEX idx_standings_league_season ON public.standings(league, season);
CREATE INDEX idx_standings_team ON public.standings(team_abbr);

-- Trigger for updated_at
CREATE TRIGGER update_standings_updated_at
BEFORE UPDATE ON public.standings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
