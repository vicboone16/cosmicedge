
-- Drop all PBP views cleanly
DROP VIEW IF EXISTS pbp_substitution_events CASCADE;
DROP VIEW IF EXISTS live_player_tracking_pbp_patch CASCADE;
DROP VIEW IF EXISTS live_player_fantasy_scores CASCADE;
DROP VIEW IF EXISTS live_player_stats_by_window CASCADE;
DROP VIEW IF EXISTS live_player_stats_aggregated CASCADE;
DROP VIEW IF EXISTS pbp_stat_deltas CASCADE;
DROP VIEW IF EXISTS pbp_event_participants_enriched CASCADE;
DROP VIEW IF EXISTS pbp_event_participants CASCADE;
DROP VIEW IF EXISTS pbp_parsed_events CASCADE;

-- 1) Base parsed events from nba_pbp_events
CREATE VIEW pbp_parsed_events AS
SELECT
    e.id AS event_id,
    e.game_key AS game_id,
    e.period,
    e.event_ts_game AS clock,
    e.created_at AS wallclock,
    e.team_abbr AS team_id,
    e.player_id AS bdl_player_id,
    e.player_name,
    e.raw AS play_json,
    COALESCE(e.description, '') AS description,
    e.home_score,
    e.away_score,
    CASE
        WHEN e.description ILIKE '%makes 3-pt%' THEN 'SHOT_MADE_3'
        WHEN e.description ILIKE '%misses 3-pt%' THEN 'SHOT_MISSED_3'
        WHEN e.description ILIKE '%makes free throw%' THEN 'FT_MADE'
        WHEN e.description ILIKE '%misses free throw%' THEN 'FT_MISSED'
        WHEN e.description ILIKE '%offensive rebound%' THEN 'REBOUND_OFF'
        WHEN e.description ILIKE '%defensive rebound%' THEN 'REBOUND_DEF'
        WHEN e.description ILIKE '%steal%' THEN 'STEAL'
        WHEN e.description ILIKE '%turnover%' THEN 'TURNOVER'
        WHEN e.description ILIKE '%shooting foul%' THEN 'FOUL_SHOOTING'
        WHEN e.description ILIKE '%offensive foul%' THEN 'FOUL_OFFENSIVE'
        WHEN e.description ILIKE '%loose ball foul%' THEN 'FOUL_LOOSE_BALL'
        WHEN e.description ILIKE '%take foul%' THEN 'FOUL_TAKE'
        WHEN e.description ILIKE '%flagrant%' THEN 'FOUL_FLAGRANT'
        WHEN e.description ILIKE '%foul%' THEN 'FOUL_PERSONAL'
        WHEN e.description ILIKE '%enters the game%' THEN 'SUBSTITUTION'
        WHEN e.description ILIKE '%timeout%' THEN 'TIMEOUT'
        WHEN e.description ILIKE '%violation%' THEN 'VIOLATION'
        WHEN e.description ILIKE '%goaltending%' THEN 'GOALTEND'
        WHEN e.description ILIKE '%challenge%' THEN 'CHALLENGE'
        WHEN e.description ILIKE '%ejected%' THEN 'EJECTION'
        WHEN e.description ILIKE '%jump ball%' THEN 'JUMP_BALL'
        WHEN e.description ILIKE '%makes%' AND e.description NOT ILIKE '%3-pt%' AND e.description NOT ILIKE '%free throw%' THEN 'SHOT_MADE_2'
        WHEN e.description ILIKE '%misses%' AND e.description NOT ILIKE '%3-pt%' AND e.description NOT ILIKE '%free throw%' THEN 'SHOT_MISSED_2'
        ELSE 'OTHER'
    END AS parsed_event_type,
    pl.id AS resolved_player_id
FROM public.nba_pbp_events e
LEFT JOIN public.players pl ON pl.external_id = e.player_id;

-- 2) Participants expansion - inner join so only rows with participants appear
CREATE VIEW pbp_event_participants AS
SELECT
    pe.event_id,
    pe.game_id,
    pe.period,
    pe.clock,
    pe.wallclock,
    pe.team_id,
    pe.description,
    pe.parsed_event_type AS event_type,
    pe.resolved_player_id AS primary_player_id,
    pe.bdl_player_id AS primary_bdl_player_id,
    (part.value)::text AS participant_bdl_id,
    pl2.id AS participant_player_id,
    part.ordinality AS participant_order
FROM pbp_parsed_events pe,
     jsonb_array_elements(pe.play_json->'participants') WITH ORDINALITY AS part(value, ordinality)
LEFT JOIN public.players pl2 ON pl2.external_id = (part.value)::text
WHERE pe.play_json->'participants' IS NOT NULL
  AND jsonb_typeof(pe.play_json->'participants') = 'array'
  AND jsonb_array_length(pe.play_json->'participants') > 0;

-- 3) Stat deltas with participant-aware assists/steals/blocks
CREATE VIEW pbp_stat_deltas AS
SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id AS player_id, player_name, 'points'::text AS stat_key, 2::numeric AS stat_delta FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'two_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'two_pm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'two_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MISSED_2'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'points', 3 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'three_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'three_pm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'three_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MISSED_3'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'points', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'fta', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'ftm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'fta', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MISSED'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'oreb', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_OFF' AND (resolved_player_id IS NOT NULL OR COALESCE(player_name,'') <> '')
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'rebounds', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_OFF' AND (resolved_player_id IS NOT NULL OR COALESCE(player_name,'') <> '')
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'dreb', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_DEF' AND (resolved_player_id IS NOT NULL OR COALESCE(player_name,'') <> '')
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'rebounds', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_DEF' AND (resolved_player_id IS NOT NULL OR COALESCE(player_name,'') <> '')
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'turnovers', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'TURNOVER'
UNION ALL SELECT game_id, event_id, period, clock, wallclock, team_id, resolved_player_id, player_name, 'personal_fouls', 1 FROM pbp_parsed_events WHERE parsed_event_type IN ('FOUL_SHOOTING','FOUL_OFFENSIVE','FOUL_LOOSE_BALL','FOUL_TAKE','FOUL_FLAGRANT','FOUL_PERSONAL')
-- Participant-aware assists
UNION ALL SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id, NULL::text, 'assists', 1
FROM pbp_event_participants ep
WHERE ep.event_type IN ('SHOT_MADE_2','SHOT_MADE_3') AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ILIKE '%assist%'
-- Participant-aware steals
UNION ALL SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id, NULL::text, 'steals', 1
FROM pbp_event_participants ep
WHERE ep.event_type = 'TURNOVER' AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ILIKE '%steal%'
-- Participant-aware blocks
UNION ALL SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id, NULL::text, 'blocks', 1
FROM pbp_event_participants ep
WHERE ep.event_type IN ('SHOT_MISSED_2','SHOT_MISSED_3') AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ILIKE '%block%';

-- 4) Aggregated by period
CREATE VIEW live_player_stats_aggregated AS
SELECT
    d.game_id, d.team_id, d.player_id, MAX(d.player_name) AS player_name, d.period,
    SUM(CASE WHEN stat_key='points' THEN stat_delta ELSE 0 END) AS points,
    SUM(CASE WHEN stat_key='rebounds' THEN stat_delta ELSE 0 END) AS rebounds,
    SUM(CASE WHEN stat_key='assists' THEN stat_delta ELSE 0 END) AS assists,
    SUM(CASE WHEN stat_key='steals' THEN stat_delta ELSE 0 END) AS steals,
    SUM(CASE WHEN stat_key='blocks' THEN stat_delta ELSE 0 END) AS blocks,
    SUM(CASE WHEN stat_key='turnovers' THEN stat_delta ELSE 0 END) AS turnovers,
    SUM(CASE WHEN stat_key='two_pa' THEN stat_delta ELSE 0 END) AS two_pa,
    SUM(CASE WHEN stat_key='two_pm' THEN stat_delta ELSE 0 END) AS two_pm,
    SUM(CASE WHEN stat_key='three_pa' THEN stat_delta ELSE 0 END) AS three_pa,
    SUM(CASE WHEN stat_key='three_pm' THEN stat_delta ELSE 0 END) AS three_pm,
    SUM(CASE WHEN stat_key='fta' THEN stat_delta ELSE 0 END) AS fta,
    SUM(CASE WHEN stat_key='ftm' THEN stat_delta ELSE 0 END) AS ftm,
    SUM(CASE WHEN stat_key='oreb' THEN stat_delta ELSE 0 END) AS oreb,
    SUM(CASE WHEN stat_key='dreb' THEN stat_delta ELSE 0 END) AS dreb,
    SUM(CASE WHEN stat_key='personal_fouls' THEN stat_delta ELSE 0 END) AS personal_fouls
FROM pbp_stat_deltas d
WHERE d.player_id IS NOT NULL
GROUP BY d.game_id, d.team_id, d.player_id, d.period;

-- 5) Window stats
CREATE VIEW live_player_stats_by_window AS
SELECT
    game_id, team_id, player_id, MAX(player_name) AS player_name,
    SUM(points) AS game_points, SUM(rebounds) AS game_rebounds, SUM(assists) AS game_assists,
    SUM(steals) AS game_steals, SUM(blocks) AS game_blocks, SUM(turnovers) AS game_turnovers,
    SUM(two_pa) AS game_two_pa, SUM(two_pm) AS game_two_pm,
    SUM(three_pa) AS game_three_pa, SUM(three_pm) AS game_three_pm,
    SUM(fta) AS game_fta, SUM(ftm) AS game_ftm,
    SUM(oreb) AS game_oreb, SUM(dreb) AS game_dreb,
    SUM(points) FILTER (WHERE period IN (1,2)) AS first_half_points,
    SUM(rebounds) FILTER (WHERE period IN (1,2)) AS first_half_rebounds,
    SUM(assists) FILTER (WHERE period IN (1,2)) AS first_half_assists,
    SUM(steals) FILTER (WHERE period IN (1,2)) AS first_half_steals,
    SUM(blocks) FILTER (WHERE period IN (1,2)) AS first_half_blocks,
    SUM(turnovers) FILTER (WHERE period IN (1,2)) AS first_half_turnovers,
    SUM(points) FILTER (WHERE period IN (3,4)) AS second_half_points,
    SUM(rebounds) FILTER (WHERE period IN (3,4)) AS second_half_rebounds,
    SUM(assists) FILTER (WHERE period IN (3,4)) AS second_half_assists,
    SUM(steals) FILTER (WHERE period IN (3,4)) AS second_half_steals,
    SUM(blocks) FILTER (WHERE period IN (3,4)) AS second_half_blocks,
    SUM(turnovers) FILTER (WHERE period IN (3,4)) AS second_half_turnovers,
    SUM(points) FILTER (WHERE period=1) AS q1_points, SUM(points) FILTER (WHERE period=2) AS q2_points,
    SUM(points) FILTER (WHERE period=3) AS q3_points, SUM(points) FILTER (WHERE period=4) AS q4_points,
    SUM(rebounds) FILTER (WHERE period=1) AS q1_rebounds, SUM(rebounds) FILTER (WHERE period=2) AS q2_rebounds,
    SUM(rebounds) FILTER (WHERE period=3) AS q3_rebounds, SUM(rebounds) FILTER (WHERE period=4) AS q4_rebounds,
    SUM(assists) FILTER (WHERE period=1) AS q1_assists, SUM(assists) FILTER (WHERE period=2) AS q2_assists,
    SUM(assists) FILTER (WHERE period=3) AS q3_assists, SUM(assists) FILTER (WHERE period=4) AS q4_assists,
    SUM(points) FILTER (WHERE period>4) AS ot_points, SUM(rebounds) FILTER (WHERE period>4) AS ot_rebounds,
    SUM(assists) FILTER (WHERE period>4) AS ot_assists, SUM(steals) FILTER (WHERE period>4) AS ot_steals,
    SUM(blocks) FILTER (WHERE period>4) AS ot_blocks, SUM(turnovers) FILTER (WHERE period>4) AS ot_turnovers
FROM live_player_stats_aggregated
GROUP BY game_id, team_id, player_id;

-- 6) Fantasy scores
CREATE VIEW live_player_fantasy_scores AS
SELECT
    game_id, team_id, player_id, player_name,
    game_points + (game_rebounds * 1.2) + (game_assists * 1.5) + (game_steals * 3) + (game_blocks * 3) - game_turnovers AS game_fantasy_score,
    first_half_points + (first_half_rebounds * 1.2) + (first_half_assists * 1.5) + (first_half_steals * 3) + (first_half_blocks * 3) - first_half_turnovers AS first_half_fantasy_score,
    second_half_points + (second_half_rebounds * 1.2) + (second_half_assists * 1.5) + (second_half_steals * 3) + (second_half_blocks * 3) - second_half_turnovers AS second_half_fantasy_score
FROM live_player_stats_by_window;

-- 7) PBP patch view with PIE
CREATE VIEW live_player_tracking_pbp_patch AS
SELECT
    s.game_id, s.team_id, s.player_id,
    COALESCE(s.player_name, pl.name) AS player_name,
    s.game_points AS points, s.game_rebounds AS rebounds, s.game_assists AS assists,
    s.game_steals AS steals, s.game_blocks AS blocks, s.game_turnovers AS turnovers,
    s.game_two_pa AS two_pa, s.game_two_pm AS two_pm,
    s.game_three_pa AS three_pa, s.game_three_pm AS three_pm,
    s.game_fta AS fta, s.game_ftm AS ftm,
    s.game_oreb AS oreb, s.game_dreb AS dreb,
    f.game_fantasy_score,
    s.game_points + (s.game_two_pm + s.game_three_pm) + s.game_ftm
    - (s.game_two_pa + s.game_three_pa) - s.game_fta
    + s.game_dreb + (0.5 * s.game_oreb) + s.game_assists
    + s.game_steals + (0.5 * s.game_blocks) - s.game_turnovers AS pbp_pie_numerator
FROM live_player_stats_by_window s
LEFT JOIN live_player_fantasy_scores f ON s.game_id = f.game_id AND s.player_id = f.player_id
LEFT JOIN public.players pl ON pl.id = s.player_id;

-- 8) Substitution events
CREATE VIEW pbp_substitution_events AS
SELECT
    ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock,
    ep.team_id, ep.description,
    ep.participant_bdl_id, ep.participant_player_id, ep.participant_order,
    CASE WHEN ep.participant_order = 1 THEN 'PLAYER_IN' WHEN ep.participant_order = 2 THEN 'PLAYER_OUT' ELSE 'UNKNOWN' END AS substitution_role_guess
FROM pbp_event_participants ep
WHERE ep.event_type = 'SUBSTITUTION';
