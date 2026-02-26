-- Fix np_rebuild_team_pace to handle missing OREB/TOV and filter partial games
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
      SUM(pgs.fg_attempted) AS fga,
      SUM(pgs.ft_attempted) AS fta,
      SUM(COALESCE(pgs.off_rebounds, 0)) AS oreb,
      SUM(COALESCE(pgs.turnovers, 0)) AS tov,
      SUM(pgs.points) AS pts,
      COUNT(*) AS player_count
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.period = 'full'
      AND g.league = p_league
      AND g.status = 'final'
    GROUP BY pgs.team_abbr, pgs.game_id, g.home_abbr, g.away_abbr, g.home_score, g.away_score
    HAVING COUNT(*) >= 5  -- filter partial/orphan records
  ),
  team_possessions AS (
    SELECT
      t.team_abbr,
      t.game_id,
      -- Use FGA + 0.44*FTA when available, fallback to score-based estimate
      CASE 
        WHEN t.fga > 0 THEN (t.fga + 0.44 * t.fta - t.oreb + t.tov)
        ELSE GREATEST(t.pts, 80) / 1.08  -- fallback: ~1.08 pts/poss league avg
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

-- Populate nba_standings from games table
CREATE OR REPLACE FUNCTION public.rebuild_nba_standings(p_season int DEFAULT 2025)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
  v_snapshot_date text;
BEGIN
  v_snapshot_date := to_char(now(), 'YYYY-MM-DD');

  WITH team_records AS (
    SELECT
      t.abbr,
      COUNT(*) FILTER (WHERE 
        (t.abbr = g.home_abbr AND g.home_score > g.away_score) OR
        (t.abbr = g.away_abbr AND g.away_score > g.home_score)
      ) AS wins,
      COUNT(*) FILTER (WHERE 
        (t.abbr = g.home_abbr AND g.home_score < g.away_score) OR
        (t.abbr = g.away_abbr AND g.away_score < g.home_score)
      ) AS losses,
      COUNT(*) FILTER (WHERE t.abbr = g.home_abbr AND g.home_score > g.away_score) AS home_wins,
      COUNT(*) FILTER (WHERE t.abbr = g.home_abbr AND g.home_score < g.away_score) AS home_losses,
      COUNT(*) FILTER (WHERE t.abbr = g.away_abbr AND g.away_score > g.home_score) AS road_wins,
      COUNT(*) FILTER (WHERE t.abbr = g.away_abbr AND g.away_score < g.home_score) AS road_losses,
      -- Last 10 games
      (SELECT COUNT(*) FILTER (WHERE 
          (sub.abbr = sg.home_abbr AND sg.home_score > sg.away_score) OR
          (sub.abbr = sg.away_abbr AND sg.away_score > sg.home_score)
        )::text || '-' || 
        COUNT(*) FILTER (WHERE 
          (sub.abbr = sg.home_abbr AND sg.home_score < sg.away_score) OR
          (sub.abbr = sg.away_abbr AND sg.away_score < sg.home_score)
        )::text
        FROM (
          SELECT t.abbr AS abbr, sg2.*
          FROM games sg2
          WHERE sg2.league = 'NBA' AND sg2.status = 'final'
            AND sg2.home_score IS NOT NULL
            AND (sg2.home_abbr = t.abbr OR sg2.away_abbr = t.abbr)
          ORDER BY sg2.start_time DESC
          LIMIT 10
        ) sub
        JOIN games sg ON sg.id = sub.id
      ) AS last_10
    FROM (
      SELECT DISTINCT unnest(ARRAY[home_abbr, away_abbr]) AS abbr
      FROM games WHERE league = 'NBA' AND status = 'final'
    ) t
    JOIN games g ON (g.home_abbr = t.abbr OR g.away_abbr = t.abbr)
      AND g.league = 'NBA'
      AND g.status = 'final'
      AND g.home_score IS NOT NULL
    GROUP BY t.abbr
  )
  INSERT INTO nba_standings (
    team_abbr, season, snapshot_date, wins, losses,
    pct, home_wins, home_losses, road_wins, road_losses, last_10
  )
  SELECT
    tr.abbr, p_season, v_snapshot_date,
    tr.wins, tr.losses,
    CASE WHEN (tr.wins + tr.losses) > 0 
      THEN ROUND(tr.wins::numeric / (tr.wins + tr.losses), 3) 
      ELSE 0 END,
    tr.home_wins, tr.home_losses, tr.road_wins, tr.road_losses,
    tr.last_10
  FROM team_records tr
  ON CONFLICT (team_abbr, season, snapshot_date)
  DO UPDATE SET
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    pct = EXCLUDED.pct,
    home_wins = EXCLUDED.home_wins,
    home_losses = EXCLUDED.home_losses,
    road_wins = EXCLUDED.road_wins,
    road_losses = EXCLUDED.road_losses,
    last_10 = EXCLUDED.last_10,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

-- Add unique constraint for standings upsert if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'nba_standings_team_season_date_key'
  ) THEN
    CREATE UNIQUE INDEX nba_standings_team_season_date_key 
    ON nba_standings (team_abbr, season, snapshot_date);
  END IF;
END $$;

-- Add conference data mapping
CREATE OR REPLACE FUNCTION public.nba_team_conference(p_abbr text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE p_abbr
    WHEN 'ATL' THEN 'East' WHEN 'BOS' THEN 'East' WHEN 'BKN' THEN 'East'
    WHEN 'CHA' THEN 'East' WHEN 'CHI' THEN 'East' WHEN 'CLE' THEN 'East'
    WHEN 'DET' THEN 'East' WHEN 'IND' THEN 'East' WHEN 'MIA' THEN 'East'
    WHEN 'MIL' THEN 'East' WHEN 'NYK' THEN 'East' WHEN 'ORL' THEN 'East'
    WHEN 'PHI' THEN 'East' WHEN 'TOR' THEN 'East' WHEN 'WAS' THEN 'East'
    WHEN 'DAL' THEN 'West' WHEN 'DEN' THEN 'West' WHEN 'GSW' THEN 'West'
    WHEN 'HOU' THEN 'West' WHEN 'LAC' THEN 'West' WHEN 'LAL' THEN 'West'
    WHEN 'MEM' THEN 'West' WHEN 'MIN' THEN 'West' WHEN 'NOP' THEN 'West'
    WHEN 'OKC' THEN 'West' WHEN 'PHX' THEN 'West' WHEN 'POR' THEN 'West'
    WHEN 'SAC' THEN 'West' WHEN 'SAS' THEN 'West' WHEN 'UTA' THEN 'West'
    ELSE 'Unknown'
  END;
$function$;
