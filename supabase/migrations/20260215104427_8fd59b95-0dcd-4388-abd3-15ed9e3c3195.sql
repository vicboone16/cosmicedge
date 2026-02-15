-- Add period column to player_game_stats for per-quarter/half tracking
ALTER TABLE public.player_game_stats
  ADD COLUMN period text NOT NULL DEFAULT 'full';

-- Update the unique constraint to include period
ALTER TABLE public.player_game_stats
  DROP CONSTRAINT IF EXISTS player_game_stats_game_id_player_id_key;

CREATE UNIQUE INDEX player_game_stats_game_player_period_unique
  ON public.player_game_stats (game_id, player_id, period);

-- Create the aggregation function that computes period averages
-- Stores both rolling-10 and full-season averages
CREATE OR REPLACE FUNCTION public.aggregate_period_stats(p_game_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_season int;
  v_league text;
BEGIN
  -- Determine season: NBA/NHL = Oct start, MLB = Mar, NFL = Sep
  v_season := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 10 THEN EXTRACT(YEAR FROM now())::int
    ELSE (EXTRACT(YEAR FROM now()) - 1)::int
  END;

  -- Loop through distinct player+period combos that have data
  FOR rec IN
    SELECT DISTINCT pgs.player_id, pgs.period, g.league
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.period != 'full'
      AND g.status = 'final'
      AND (p_game_id IS NULL OR pgs.game_id = p_game_id)
  LOOP
    v_league := rec.league;
    -- Determine season based on league
    v_season := CASE
      WHEN v_league IN ('NBA', 'NHL') AND EXTRACT(MONTH FROM now()) >= 10 THEN EXTRACT(YEAR FROM now())::int
      WHEN v_league IN ('NBA', 'NHL') THEN (EXTRACT(YEAR FROM now()) - 1)::int
      WHEN v_league = 'NFL' AND EXTRACT(MONTH FROM now()) >= 9 THEN EXTRACT(YEAR FROM now())::int
      WHEN v_league = 'NFL' THEN (EXTRACT(YEAR FROM now()) - 1)::int
      ELSE EXTRACT(YEAR FROM now())::int
    END;

    -- Full-season averages for this period
    INSERT INTO player_season_stats (
      player_id, season, league, stat_type, period,
      games_played, minutes_per_game, points_per_game, rebounds_per_game,
      assists_per_game, steals_per_game, blocks_per_game, turnovers_per_game,
      fg_made, fg_attempted, three_made, three_attempted,
      ft_made, ft_attempted, off_rebounds, def_rebounds,
      updated_at
    )
    SELECT
      pgs.player_id, v_season, v_league, 'averages', rec.period,
      COUNT(*)::int,
      AVG(pgs.minutes), AVG(pgs.points), AVG(pgs.rebounds),
      AVG(pgs.assists), AVG(pgs.steals), AVG(pgs.blocks), AVG(pgs.turnovers),
      AVG(pgs.fg_made), AVG(pgs.fg_attempted), AVG(pgs.three_made), AVG(pgs.three_attempted),
      AVG(pgs.ft_made), AVG(pgs.ft_attempted), AVG(pgs.off_rebounds), AVG(pgs.def_rebounds),
      now()
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.player_id = rec.player_id
      AND pgs.period = rec.period
      AND g.league = v_league
      AND g.status = 'final'
    GROUP BY pgs.player_id
    ON CONFLICT (player_id, season, league, stat_type, period)
    DO UPDATE SET
      games_played = EXCLUDED.games_played,
      minutes_per_game = EXCLUDED.minutes_per_game,
      points_per_game = EXCLUDED.points_per_game,
      rebounds_per_game = EXCLUDED.rebounds_per_game,
      assists_per_game = EXCLUDED.assists_per_game,
      steals_per_game = EXCLUDED.steals_per_game,
      blocks_per_game = EXCLUDED.blocks_per_game,
      turnovers_per_game = EXCLUDED.turnovers_per_game,
      fg_made = EXCLUDED.fg_made,
      fg_attempted = EXCLUDED.fg_attempted,
      three_made = EXCLUDED.three_made,
      three_attempted = EXCLUDED.three_attempted,
      ft_made = EXCLUDED.ft_made,
      ft_attempted = EXCLUDED.ft_attempted,
      off_rebounds = EXCLUDED.off_rebounds,
      def_rebounds = EXCLUDED.def_rebounds,
      updated_at = EXCLUDED.updated_at;

    -- Rolling last-10 averages for this period
    INSERT INTO player_season_stats (
      player_id, season, league, stat_type, period,
      games_played, minutes_per_game, points_per_game, rebounds_per_game,
      assists_per_game, steals_per_game, blocks_per_game, turnovers_per_game,
      fg_made, fg_attempted, three_made, three_attempted,
      ft_made, ft_attempted, off_rebounds, def_rebounds,
      updated_at
    )
    SELECT
      sub.player_id, v_season, v_league, 'averages_l10', rec.period,
      COUNT(*)::int,
      AVG(sub.minutes), AVG(sub.points), AVG(sub.rebounds),
      AVG(sub.assists), AVG(sub.steals), AVG(sub.blocks), AVG(sub.turnovers),
      AVG(sub.fg_made), AVG(sub.fg_attempted), AVG(sub.three_made), AVG(sub.three_attempted),
      AVG(sub.ft_made), AVG(sub.ft_attempted), AVG(sub.off_rebounds), AVG(sub.def_rebounds),
      now()
    FROM (
      SELECT pgs.*
      FROM player_game_stats pgs
      JOIN games g ON g.id = pgs.game_id
      WHERE pgs.player_id = rec.player_id
        AND pgs.period = rec.period
        AND g.league = v_league
        AND g.status = 'final'
      ORDER BY g.start_time DESC
      LIMIT 10
    ) sub
    GROUP BY sub.player_id
    ON CONFLICT (player_id, season, league, stat_type, period)
    DO UPDATE SET
      games_played = EXCLUDED.games_played,
      minutes_per_game = EXCLUDED.minutes_per_game,
      points_per_game = EXCLUDED.points_per_game,
      rebounds_per_game = EXCLUDED.rebounds_per_game,
      assists_per_game = EXCLUDED.assists_per_game,
      steals_per_game = EXCLUDED.steals_per_game,
      blocks_per_game = EXCLUDED.blocks_per_game,
      turnovers_per_game = EXCLUDED.turnovers_per_game,
      fg_made = EXCLUDED.fg_made,
      fg_attempted = EXCLUDED.fg_attempted,
      three_made = EXCLUDED.three_made,
      three_attempted = EXCLUDED.three_attempted,
      ft_made = EXCLUDED.ft_made,
      ft_attempted = EXCLUDED.ft_attempted,
      off_rebounds = EXCLUDED.off_rebounds,
      def_rebounds = EXCLUDED.def_rebounds,
      updated_at = EXCLUDED.updated_at;

  END LOOP;
END;
$$;

-- Create trigger function for when a game is finalized
CREATE OR REPLACE FUNCTION public.on_game_finalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'final' AND (OLD.status IS NULL OR OLD.status != 'final') THEN
    PERFORM aggregate_period_stats(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on games table
CREATE TRIGGER trg_game_finalized_aggregate_periods
  AFTER UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.on_game_finalized();