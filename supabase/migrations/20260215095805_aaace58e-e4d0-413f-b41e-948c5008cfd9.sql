
-- Add stat_type to distinguish totals vs averages
ALTER TABLE public.player_season_stats 
  ADD COLUMN IF NOT EXISTS stat_type TEXT NOT NULL DEFAULT 'averages';

-- Add missing columns for full CSV coverage
ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS games_started INTEGER,
  ADD COLUMN IF NOT EXISTS fg_made DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fg_attempted DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS three_made DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS three_attempted DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS two_made DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS two_attempted DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS two_pct DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ft_made DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ft_attempted DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS off_rebounds DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS def_rebounds DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS personal_fouls DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS triple_doubles INTEGER;

-- Drop old unique constraints that don't include stat_type
ALTER TABLE public.player_season_stats DROP CONSTRAINT IF EXISTS player_season_stats_player_id_season_key;
ALTER TABLE public.player_season_stats DROP CONSTRAINT IF EXISTS player_season_stats_player_season_league_unique;

-- Create new unique constraint including stat_type
ALTER TABLE public.player_season_stats 
  ADD CONSTRAINT player_season_stats_player_season_league_type_unique 
  UNIQUE (player_id, season, league, stat_type);
