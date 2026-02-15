
-- Add comprehensive columns to team_season_stats
ALTER TABLE public.team_season_stats
  ADD COLUMN IF NOT EXISTS snapshot_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS games INTEGER,
  ADD COLUMN IF NOT EXISTS fg_made INTEGER,
  ADD COLUMN IF NOT EXISTS fg_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS three_made INTEGER,
  ADD COLUMN IF NOT EXISTS three_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS ft_made INTEGER,
  ADD COLUMN IF NOT EXISTS ft_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS off_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS def_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS tot_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS assists INTEGER,
  ADD COLUMN IF NOT EXISTS personal_fouls INTEGER,
  ADD COLUMN IF NOT EXISTS disqualifications INTEGER,
  ADD COLUMN IF NOT EXISTS steals INTEGER,
  ADD COLUMN IF NOT EXISTS turnovers INTEGER,
  ADD COLUMN IF NOT EXISTS blocks INTEGER,
  ADD COLUMN IF NOT EXISTS points INTEGER,
  -- Opponent totals
  ADD COLUMN IF NOT EXISTS opp_fg_made INTEGER,
  ADD COLUMN IF NOT EXISTS opp_fg_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS opp_ft_made INTEGER,
  ADD COLUMN IF NOT EXISTS opp_ft_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS opp_three_made INTEGER,
  ADD COLUMN IF NOT EXISTS opp_three_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS opp_off_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS opp_def_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS opp_tot_rebounds INTEGER,
  ADD COLUMN IF NOT EXISTS opp_assists INTEGER,
  ADD COLUMN IF NOT EXISTS opp_personal_fouls INTEGER,
  ADD COLUMN IF NOT EXISTS opp_disqualifications INTEGER,
  ADD COLUMN IF NOT EXISTS opp_steals INTEGER,
  ADD COLUMN IF NOT EXISTS opp_turnovers INTEGER,
  ADD COLUMN IF NOT EXISTS opp_blocks INTEGER,
  ADD COLUMN IF NOT EXISTS opp_points INTEGER,
  ADD COLUMN IF NOT EXISTS point_diff NUMERIC(5,1),
  -- Misc
  ADD COLUMN IF NOT EXISTS off_reb_pct NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS def_reb_pct NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS tot_reb_pct NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS below_100_own INTEGER,
  ADD COLUMN IF NOT EXISTS below_100_opp INTEGER,
  ADD COLUMN IF NOT EXISTS ot_wins INTEGER,
  ADD COLUMN IF NOT EXISTS ot_losses INTEGER,
  ADD COLUMN IF NOT EXISTS decided_3_wins INTEGER,
  ADD COLUMN IF NOT EXISTS decided_3_losses INTEGER,
  ADD COLUMN IF NOT EXISTS decided_10_wins INTEGER,
  ADD COLUMN IF NOT EXISTS decided_10_losses INTEGER,
  -- Paint & fast break
  ADD COLUMN IF NOT EXISTS points_in_paint INTEGER,
  ADD COLUMN IF NOT EXISTS points_in_paint_pg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS opp_points_in_paint INTEGER,
  ADD COLUMN IF NOT EXISTS opp_points_in_paint_pg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS fast_break_points INTEGER,
  ADD COLUMN IF NOT EXISTS fast_break_points_pg NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS opp_fast_break_points INTEGER,
  ADD COLUMN IF NOT EXISTS opp_fast_break_points_pg NUMERIC(5,1),
  -- Ratios
  ADD COLUMN IF NOT EXISTS ast_to_ratio NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS stl_to_ratio NUMERIC(4,2);

-- Create nba_standings table
CREATE TABLE public.nba_standings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_abbr TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 2026,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  conference TEXT,
  division TEXT,
  wins INTEGER, losses INTEGER,
  pct NUMERIC(4,3), gb NUMERIC(4,1),
  home_wins INTEGER, home_losses INTEGER,
  road_wins INTEGER, road_losses INTEGER,
  neutral_wins INTEGER, neutral_losses INTEGER,
  last_10 TEXT,
  streak TEXT,
  h2h_record JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_abbr, season, snapshot_date)
);

ALTER TABLE public.nba_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standings are viewable by everyone" ON public.nba_standings FOR SELECT USING (true);
CREATE POLICY "Service role can manage standings" ON public.nba_standings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_nba_standings_updated_at BEFORE UPDATE ON public.nba_standings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
