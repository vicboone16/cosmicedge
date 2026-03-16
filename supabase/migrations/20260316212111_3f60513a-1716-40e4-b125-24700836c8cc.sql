
-- PBP Parsing Pipeline: adapted to existing play_by_play table schema
-- play_by_play has: id, game_id(uuid), sequence, quarter(int), clock, event_type, description, team_abbr, player_id(uuid), assist_player_id, home_score, away_score, clock_seconds, seconds_remaining_game, seconds_elapsed_game

-- 1) Parsed events view
DROP VIEW IF EXISTS live_props_pbp_stats_patch CASCADE;
DROP VIEW IF EXISTS oracle_pbp_stats_patch CASCADE;
DROP VIEW IF EXISTS live_player_tracking_pbp_patch CASCADE;
DROP VIEW IF EXISTS live_player_fantasy_scores CASCADE;
DROP VIEW IF EXISTS live_player_stats_by_window CASCADE;
DROP VIEW IF EXISTS live_player_stats_aggregated CASCADE;
DROP VIEW IF EXISTS pbp_stat_deltas CASCADE;
DROP VIEW IF EXISTS pbp_parsed_events CASCADE;

CREATE VIEW pbp_parsed_events AS
SELECT
    p.id AS event_id,
    p.game_id,
    p.quarter AS period,
    p.clock,
    p.clock_seconds,
    p.seconds_elapsed_game,
    p.team_abbr AS team_id,
    p.player_id,
    p.assist_player_id,
    p.home_score,
    p.away_score,
    p.description,
    p.sequence,
    CASE
        WHEN p.description ILIKE '%makes 3-pt%' THEN 'SHOT_MADE_3'
        WHEN p.description ILIKE '%misses 3-pt%' THEN 'SHOT_MISSED_3'
        WHEN p.description ILIKE '%makes free throw%' THEN 'FT_MADE'
        WHEN p.description ILIKE '%misses free throw%' THEN 'FT_MISSED'
        WHEN p.description ILIKE '%offensive rebound%' THEN 'REBOUND_OFF'
        WHEN p.description ILIKE '%defensive rebound%' THEN 'REBOUND_DEF'
        WHEN p.description ILIKE '%assist%' THEN 'ASSIST'
        WHEN p.description ILIKE '%steal%' THEN 'STEAL'
        WHEN p.description ILIKE '%block%' THEN 'BLOCK'
        WHEN p.description ILIKE '%turnover%' THEN 'TURNOVER'
        WHEN p.description ILIKE '%shooting foul%' THEN 'FOUL_SHOOTING'
        WHEN p.description ILIKE '%offensive foul%' THEN 'FOUL_OFFENSIVE'
        WHEN p.description ILIKE '%loose ball foul%' THEN 'FOUL_LOOSE_BALL'
        WHEN p.description ILIKE '%take foul%' THEN 'FOUL_TAKE'
        WHEN p.description ILIKE '%flagrant%' THEN 'FOUL_FLAGRANT'
        WHEN p.description ILIKE '%foul%' THEN 'FOUL_PERSONAL'
        WHEN p.description ILIKE '%jump ball%' THEN 'JUMP_BALL'
        WHEN p.description ILIKE '%substitution%' THEN 'SUBSTITUTION'
        WHEN p.description ILIKE '%timeout%' THEN 'TIMEOUT'
        WHEN p.description ILIKE '%violation%' THEN 'VIOLATION'
        WHEN p.description ILIKE '%goaltending%' THEN 'GOALTEND'
        WHEN p.description ILIKE '%challenge%' THEN 'CHALLENGE'
        WHEN p.description ILIKE '%ejected%' THEN 'EJECTION'
        WHEN p.description ILIKE '%makes%'
             AND p.description NOT ILIKE '%3-pt%'
             AND p.description NOT ILIKE '%free throw%'
        THEN 'SHOT_MADE_2'
        WHEN p.description ILIKE '%misses%'
             AND p.description NOT ILIKE '%3-pt%'
             AND p.description NOT ILIKE '%free throw%'
        THEN 'SHOT_MISSED_2'
        ELSE 'OTHER'
    END AS parsed_event_type
FROM public.play_by_play p;

-- 2) Stat deltas
CREATE VIEW pbp_stat_deltas AS
SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'points'::text AS stat_key, 2::numeric AS stat_delta FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'two_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'two_pm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_2'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'two_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MISSED_2'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'points', 3 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'three_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'three_pm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MADE_3'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'three_pa', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'SHOT_MISSED_3'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'points', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'fta', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'ftm', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MADE'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'fta', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'FT_MISSED'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'oreb', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_OFF' AND player_id IS NOT NULL
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'rebounds', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_OFF' AND player_id IS NOT NULL
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'dreb', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_DEF' AND player_id IS NOT NULL
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'rebounds', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'REBOUND_DEF' AND player_id IS NOT NULL
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'assists', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'ASSIST'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'steals', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'STEAL'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'blocks', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'BLOCK'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'turnovers', 1 FROM pbp_parsed_events WHERE parsed_event_type = 'TURNOVER'
UNION ALL SELECT game_id, event_id, period, clock, clock_seconds, team_id, player_id, 'personal_fouls', 1 FROM pbp_parsed_events WHERE parsed_event_type IN ('FOUL_SHOOTING','FOUL_OFFENSIVE','FOUL_LOOSE_BALL','FOUL_TAKE','FOUL_FLAGRANT','FOUL_PERSONAL');

-- 3) Aggregated by period
CREATE VIEW live_player_stats_aggregated AS
SELECT
    d.game_id, d.team_id, d.player_id, d.period,
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

-- 4) Window stats
CREATE VIEW live_player_stats_by_window AS
SELECT
    game_id, team_id, player_id,
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

-- 5) Fantasy scores
CREATE VIEW live_player_fantasy_scores AS
SELECT
    game_id, team_id, player_id,
    game_points + (game_rebounds * 1.2) + (game_assists * 1.5) + (game_steals * 3) + (game_blocks * 3) - game_turnovers AS game_fantasy_score,
    first_half_points + (first_half_rebounds * 1.2) + (first_half_assists * 1.5) + (first_half_steals * 3) + (first_half_blocks * 3) - first_half_turnovers AS first_half_fantasy_score,
    second_half_points + (second_half_rebounds * 1.2) + (second_half_assists * 1.5) + (second_half_steals * 3) + (second_half_blocks * 3) - second_half_turnovers AS second_half_fantasy_score
FROM live_player_stats_by_window;

-- 6) PBP patch view
CREATE VIEW live_player_tracking_pbp_patch AS
SELECT
    s.game_id, s.team_id, s.player_id,
    pl.name AS player_name,
    s.game_points AS points, s.game_rebounds AS rebounds, s.game_assists AS assists,
    s.game_steals AS steals, s.game_blocks AS blocks, s.game_turnovers AS turnovers,
    s.game_two_pa AS two_pa, s.game_two_pm AS two_pm,
    s.game_three_pa AS three_pa, s.game_three_pm AS three_pm,
    s.game_fta AS fta, s.game_ftm AS ftm,
    s.game_oreb AS oreb, s.game_dreb AS dreb,
    f.game_fantasy_score,
    -- PIE numerator
    s.game_points + (s.game_two_pm + s.game_three_pm) + s.game_ftm
    - (s.game_two_pa + s.game_three_pa) - s.game_fta
    + s.game_dreb + (0.5 * s.game_oreb) + s.game_assists
    + s.game_steals + (0.5 * s.game_blocks)
    - COALESCE((SELECT SUM(personal_fouls) FROM live_player_stats_aggregated a WHERE a.game_id=s.game_id AND a.player_id=s.player_id), 0)
    - s.game_turnovers AS pbp_pie_numerator
FROM live_player_stats_by_window s
LEFT JOIN live_player_fantasy_scores f ON s.game_id = f.game_id AND s.player_id = f.player_id
LEFT JOIN public.players pl ON pl.id = s.player_id;
