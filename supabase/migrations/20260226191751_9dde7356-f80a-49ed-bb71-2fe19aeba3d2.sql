
CREATE OR REPLACE FUNCTION public.np_rebuild_team_pace(p_season integer DEFAULT 2025, p_league text DEFAULT 'NBA'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  WITH team_game_totals AS (
    SELECT
      pgs.team_abbr,
      pgs.game_id,
      g.home_abbr,
      g.away_abbr,
      g.home_score,
      g.away_score,
      SUM(COALESCE(pgs.fg_attempted, 0)) AS fga,
      SUM(COALESCE(pgs.ft_attempted, 0)) AS fta,
      SUM(COALESCE(pgs.off_rebounds, 0)) AS oreb,
      SUM(COALESCE(pgs.turnovers, 0)) AS tov,
      SUM(COALESCE(pgs.points, 0)) AS pts,
      COUNT(*) AS player_count
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.period = 'full'
      AND g.league = p_league
      AND g.status = 'final'
    GROUP BY pgs.team_abbr, pgs.game_id, g.home_abbr, g.away_abbr, g.home_score, g.away_score
    HAVING COUNT(*) >= 5
  ),
  team_possessions AS (
    SELECT
      t.team_abbr,
      t.game_id,
      -- Only use boxscore formula when FGA is realistic (>50 per team game)
      -- Otherwise fall back to score-based estimate (~1.08 pts/possession)
      CASE 
        WHEN t.fga >= 50 THEN (t.fga + 0.44 * t.fta - t.oreb + t.tov)
        ELSE GREATEST(t.pts, 80) / 1.08
      END AS poss,
      t.pts,
      CASE WHEN t.team_abbr = t.home_abbr THEN t.away_score
           ELSE t.home_score END AS pts_allowed
    FROM team_game_totals t
  ),
  team_avgs AS (
    SELECT
      tp.team_abbr,
      COUNT(*) AS games_played,
      ROUND(AVG(tp.poss), 2) AS avg_possessions,
      ROUND(AVG(tp.poss), 2) AS avg_pace,
      ROUND(AVG(tp.pts), 2) AS avg_points,
      ROUND(AVG(tp.pts_allowed), 2) AS avg_points_allowed,
      CASE WHEN AVG(tp.poss) > 0 THEN ROUND(AVG(tp.pts) / AVG(tp.poss) * 100, 2) ELSE 0 END AS off_rating,
      CASE WHEN AVG(tp.poss) > 0 THEN ROUND(AVG(tp.pts_allowed) / AVG(tp.poss) * 100, 2) ELSE 0 END AS def_rating,
      CASE WHEN AVG(tp.poss) > 0 THEN ROUND((AVG(tp.pts) - AVG(tp.pts_allowed)) / AVG(tp.poss) * 100, 2) ELSE 0 END AS net_rating
    FROM team_possessions tp
    GROUP BY tp.team_abbr
  )
  INSERT INTO team_season_pace (
    team_abbr, season, league, games_played, avg_possessions, avg_pace,
    avg_points, avg_points_allowed, off_rating, def_rating, net_rating, updated_at
  )
  SELECT
    ta.team_abbr, p_season, p_league, ta.games_played::int, ta.avg_possessions, ta.avg_pace,
    ta.avg_points, ta.avg_points_allowed, ta.off_rating, ta.def_rating, ta.net_rating, now()
  FROM team_avgs ta
  ON CONFLICT (team_abbr, season, league)
  DO UPDATE SET
    games_played = EXCLUDED.games_played,
    avg_possessions = EXCLUDED.avg_possessions,
    avg_pace = EXCLUDED.avg_pace,
    avg_points = EXCLUDED.avg_points,
    avg_points_allowed = EXCLUDED.avg_points_allowed,
    off_rating = EXCLUDED.off_rating,
    def_rating = EXCLUDED.def_rating,
    net_rating = EXCLUDED.net_rating,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;
