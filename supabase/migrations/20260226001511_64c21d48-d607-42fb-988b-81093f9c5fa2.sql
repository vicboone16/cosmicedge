CREATE OR REPLACE FUNCTION public.rebuild_nba_standings(p_season int DEFAULT 2025)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
  v_snapshot_date date;
BEGIN
  v_snapshot_date := current_date;

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
      COUNT(*) FILTER (WHERE t.abbr = g.away_abbr AND g.away_score < g.home_score) AS road_losses
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
    pct, home_wins, home_losses, road_wins, road_losses,
    conference
  )
  SELECT
    tr.abbr, p_season, v_snapshot_date,
    tr.wins, tr.losses,
    CASE WHEN (tr.wins + tr.losses) > 0 
      THEN ROUND(tr.wins::numeric / (tr.wins + tr.losses), 3) 
      ELSE 0 END,
    tr.home_wins, tr.home_losses, tr.road_wins, tr.road_losses,
    public.nba_team_conference(tr.abbr)
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
    conference = EXCLUDED.conference,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;