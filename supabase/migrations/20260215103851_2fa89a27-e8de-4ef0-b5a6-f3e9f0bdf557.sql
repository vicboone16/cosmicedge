-- Add period column to player_season_stats (default 'full' for existing rows)
ALTER TABLE public.player_season_stats
  ADD COLUMN period text NOT NULL DEFAULT 'full';

-- Drop old unique constraint and recreate with period included
ALTER TABLE public.player_season_stats
  DROP CONSTRAINT player_season_stats_player_season_league_type_unique;

CREATE UNIQUE INDEX player_season_stats_player_season_league_type_period_unique
  ON public.player_season_stats (player_id, season, league, stat_type, period);