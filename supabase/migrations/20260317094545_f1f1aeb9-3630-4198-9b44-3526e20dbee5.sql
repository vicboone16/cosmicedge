-- Source compatibility view with raw JSONB extraction
CREATE OR REPLACE VIEW public.v_nba_pbp_source AS
SELECT
  e.id AS pbp_id,
  e.game_key,
  e.provider,
  e.provider_game_id,
  e.provider_event_id,
  e.period,
  e.event_ts_game AS clock,
  e.event_type,
  e.description,
  e.team_abbr,
  e.player_id AS provider_player_id,
  e.player_name,
  e.home_score,
  e.away_score,
  e.created_at,
  (e.raw->>'text')::text AS play_text,
  (e.raw->>'scoring_play')::boolean AS is_scoring_play,
  (e.raw->>'shooting_play')::boolean AS is_shooting_play,
  (e.raw->>'score_value')::int AS score_value,
  (e.raw->>'coordinate_x')::numeric AS coord_x,
  (e.raw->>'coordinate_y')::numeric AS coord_y,
  (e.raw->>'wallclock')::timestamptz AS wallclock,
  (e.raw->>'order')::int AS play_order,
  (e.raw->'team'->>'abbreviation')::text AS raw_team_abbr
FROM public.nba_pbp_events e;

-- Latest possession signal per game
CREATE OR REPLACE VIEW public.v_nba_pbp_latest_possession AS
WITH ranked AS (
  SELECT
    game_key,
    team_abbr,
    (raw->>'text')::text AS play_text,
    period,
    event_ts_game AS clock,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY game_key
      ORDER BY period DESC, id DESC
    ) AS rn
  FROM public.nba_pbp_events
  WHERE team_abbr IS NOT NULL
)
SELECT
  game_key,
  team_abbr AS possession_team,
  play_text AS possession_context,
  period,
  clock
FROM ranked
WHERE rn = 1;

-- Recent scoring runs (best 2-min window per team per game)
CREATE OR REPLACE VIEW public.v_nba_pbp_recent_runs AS
WITH scored AS (
  SELECT
    game_key,
    team_abbr,
    COALESCE((raw->>'score_value')::int, 0) AS pts,
    (raw->>'wallclock')::timestamptz AS wallclock,
    id AS pbp_id
  FROM public.nba_pbp_events
  WHERE (raw->>'scoring_play')::boolean = true
    AND COALESCE((raw->>'score_value')::int, 0) > 0
),
windowed AS (
  SELECT
    s1.game_key,
    s1.team_abbr,
    s1.pbp_id,
    (SELECT COALESCE(SUM(s2.pts), 0)
     FROM scored s2
     WHERE s2.game_key = s1.game_key
       AND s2.team_abbr = s1.team_abbr
       AND s2.wallclock >= s1.wallclock - INTERVAL '2 minutes'
       AND s2.wallclock <= s1.wallclock
    ) AS run_points
  FROM scored s1
),
best AS (
  SELECT
    game_key,
    team_abbr,
    MAX(run_points) AS recent_run_points
  FROM windowed
  GROUP BY game_key, team_abbr
)
SELECT game_key, team_abbr, recent_run_points FROM best;

-- Scoring droughts per team per game
CREATE OR REPLACE VIEW public.v_nba_pbp_scoring_droughts AS
WITH last_score AS (
  SELECT
    game_key,
    team_abbr,
    MAX((raw->>'wallclock')::timestamptz) AS last_score_at
  FROM public.nba_pbp_events
  WHERE (raw->>'scoring_play')::boolean = true
    AND COALESCE((raw->>'score_value')::int, 0) > 0
  GROUP BY game_key, team_abbr
),
last_event AS (
  SELECT
    game_key,
    MAX((raw->>'wallclock')::timestamptz) AS latest_event_at
  FROM public.nba_pbp_events
  GROUP BY game_key
)
SELECT
  ls.game_key,
  ls.team_abbr,
  ls.last_score_at,
  le.latest_event_at,
  EXTRACT(EPOCH FROM (le.latest_event_at - ls.last_score_at))::int AS drought_seconds
FROM last_score ls
JOIN last_event le ON le.game_key = ls.game_key;

-- Momentum state per team per game
CREATE OR REPLACE VIEW public.v_nba_pbp_momentum AS
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
FROM public.v_nba_pbp_recent_runs r
LEFT JOIN public.v_nba_pbp_scoring_droughts d
  ON r.game_key = d.game_key
 AND r.team_abbr = d.team_abbr;

-- Player involvement summary per game
CREATE OR REPLACE VIEW public.v_nba_pbp_player_involvement AS
SELECT
  e.game_key,
  COALESCE(e.player_name, e.player_id) AS player_label,
  e.team_abbr,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE (e.raw->>'scoring_play')::boolean = true) AS scoring_events,
  SUM(COALESCE((e.raw->>'score_value')::int, 0)) AS total_points,
  COUNT(*) FILTER (WHERE (e.raw->>'shooting_play')::boolean = true) AS shot_attempts,
  COUNT(*) FILTER (WHERE e.event_type ILIKE '%Turnover%') AS turnovers,
  MAX((e.raw->>'wallclock')::timestamptz) AS last_event_at
FROM public.nba_pbp_events e
WHERE COALESCE(e.player_name, e.player_id) IS NOT NULL
GROUP BY e.game_key, COALESCE(e.player_name, e.player_id), e.team_abbr;

-- Pace proxy per game
CREATE OR REPLACE VIEW public.v_nba_pbp_pace_proxy AS
SELECT
  game_key,
  COUNT(*) AS total_plays,
  COUNT(*) FILTER (WHERE (raw->>'shooting_play')::boolean = true) AS shot_plays,
  COUNT(*) FILTER (WHERE event_type ILIKE '%Turnover%') AS turnover_plays,
  MAX(period) AS latest_period,
  (COUNT(*) FILTER (WHERE (raw->>'shooting_play')::boolean = true)
   + COUNT(*) FILTER (WHERE event_type ILIKE '%Turnover%'))
  AS est_possessions
FROM public.nba_pbp_events
GROUP BY game_key;

-- Latest game state snapshot view
CREATE OR REPLACE VIEW public.v_game_snapshot_latest AS
WITH ranked AS (
  SELECT
    id,
    game_id,
    captured_at,
    status,
    home_score,
    away_score,
    quarter,
    clock,
    clock_seconds_remaining,
    possession,
    ROW_NUMBER() OVER (
      PARTITION BY game_id
      ORDER BY captured_at DESC
    ) AS rn
  FROM public.game_state_snapshots
)
SELECT
  id, game_id, captured_at, status, home_score, away_score,
  quarter, clock, clock_seconds_remaining, possession
FROM ranked WHERE rn = 1;

-- Debug view for PBP inspection
CREATE OR REPLACE VIEW public.v_nba_pbp_debug AS
SELECT
  e.id AS pbp_id,
  e.game_key,
  e.period,
  e.event_ts_game AS clock,
  e.event_type,
  e.team_abbr,
  e.player_name,
  (e.raw->>'text')::text AS play_text,
  e.home_score,
  e.away_score,
  (e.raw->>'score_value')::int AS score_value,
  (e.raw->>'scoring_play')::boolean AS is_scoring_play,
  (e.raw->>'shooting_play')::boolean AS is_shooting_play,
  (e.raw->>'coordinate_x')::numeric AS coord_x,
  (e.raw->>'coordinate_y')::numeric AS coord_y,
  (e.raw->>'wallclock')::timestamptz AS wallclock,
  (e.raw->>'order')::int AS play_order,
  e.provider,
  e.provider_event_id
FROM public.nba_pbp_events e;