-- Make momentum view dependency-safe for publish ordering
-- Avoid reliance on v_nba_pbp_recent_runs / v_nba_pbp_scoring_droughts creation order
CREATE OR REPLACE VIEW public.v_nba_pbp_momentum AS
WITH scored AS (
  SELECT
    game_key,
    team_abbr,
    COALESCE((raw->>'score_value')::int, 0) AS pts,
    (raw->>'wallclock')::timestamptz AS wallclock,
    id AS pbp_id
  FROM public.nba_pbp_events
  WHERE COALESCE((raw->>'score_value')::int, 0) > 0
),
windowed AS (
  SELECT
    s1.game_key,
    s1.team_abbr,
    (SELECT COALESCE(SUM(s2.pts), 0)
     FROM scored s2
     WHERE s2.game_key = s1.game_key
       AND s2.team_abbr = s1.team_abbr
       AND s2.wallclock >= s1.wallclock - INTERVAL '2 minutes'
       AND s2.wallclock <= s1.wallclock) AS run_points
  FROM scored s1
),
recent_runs AS (
  SELECT
    game_key,
    team_abbr,
    MAX(run_points) AS recent_run_points
  FROM windowed
  GROUP BY game_key, team_abbr
),
last_score AS (
  SELECT
    game_key,
    team_abbr,
    MAX((raw->>'wallclock')::timestamptz) AS last_score_at
  FROM public.nba_pbp_events
  WHERE COALESCE((raw->>'score_value')::int, 0) > 0
  GROUP BY game_key, team_abbr
),
last_event AS (
  SELECT
    game_key,
    MAX((raw->>'wallclock')::timestamptz) AS latest_event_at
  FROM public.nba_pbp_events
  GROUP BY game_key
),
scoring_droughts AS (
  SELECT
    ls.game_key,
    ls.team_abbr,
    EXTRACT(EPOCH FROM (le.latest_event_at - ls.last_score_at))::int AS drought_seconds
  FROM last_score ls
  JOIN last_event le ON le.game_key = ls.game_key
)
SELECT
  r.game_key,
  r.team_abbr,
  r.recent_run_points,
  COALESCE(d.drought_seconds, 0) AS drought_seconds,
  CASE
    WHEN r.recent_run_points >= 12 THEN 'explosive'
    WHEN r.recent_run_points >= 8  THEN 'surge'
    WHEN COALESCE(d.drought_seconds, 0) >= 180 THEN 'cold'
    WHEN r.recent_run_points BETWEEN 5 AND 7 THEN 'heating_up'
    ELSE 'neutral'
  END AS momentum_state
FROM recent_runs r
LEFT JOIN scoring_droughts d
  ON r.game_key = d.game_key
 AND r.team_abbr = d.team_abbr;