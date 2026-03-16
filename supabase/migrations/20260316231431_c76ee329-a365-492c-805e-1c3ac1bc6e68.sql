
-- ============================================================
-- FIX PUBLISH BLOCKER: Create 8 PBP views in dependency order
-- These exist in Test but are missing from Live.
-- CREATE OR REPLACE is safe (no-op on Test, creates on Live).
-- ============================================================

-- 1. pbp_parsed_events (base view, depends on nba_pbp_events + players)
CREATE OR REPLACE VIEW public.pbp_parsed_events AS
SELECT e.id AS event_id,
    e.game_key AS game_id,
    e.period,
    e.event_ts_game AS clock,
    e.created_at AS wallclock,
    e.team_abbr AS team_id,
    e.player_id AS bdl_player_id,
    e.player_name,
    e.raw AS play_json,
    COALESCE(e.description, ''::text) AS description,
    e.home_score,
    e.away_score,
    CASE
        WHEN (e.description ~~* '%makes 3-pt%') THEN 'SHOT_MADE_3'
        WHEN (e.description ~~* '%misses 3-pt%') THEN 'SHOT_MISSED_3'
        WHEN (e.description ~~* '%makes free throw%') THEN 'FT_MADE'
        WHEN (e.description ~~* '%misses free throw%') THEN 'FT_MISSED'
        WHEN (e.description ~~* '%offensive rebound%') THEN 'REBOUND_OFF'
        WHEN (e.description ~~* '%defensive rebound%') THEN 'REBOUND_DEF'
        WHEN (e.description ~~* '%steal%') THEN 'STEAL'
        WHEN (e.description ~~* '%turnover%') THEN 'TURNOVER'
        WHEN (e.description ~~* '%shooting foul%') THEN 'FOUL_SHOOTING'
        WHEN (e.description ~~* '%offensive foul%') THEN 'FOUL_OFFENSIVE'
        WHEN (e.description ~~* '%loose ball foul%') THEN 'FOUL_LOOSE_BALL'
        WHEN (e.description ~~* '%take foul%') THEN 'FOUL_TAKE'
        WHEN (e.description ~~* '%flagrant%') THEN 'FOUL_FLAGRANT'
        WHEN (e.description ~~* '%foul%') THEN 'FOUL_PERSONAL'
        WHEN (e.description ~~* '%enters the game%') THEN 'SUBSTITUTION'
        WHEN (e.description ~~* '%timeout%') THEN 'TIMEOUT'
        WHEN (e.description ~~* '%violation%') THEN 'VIOLATION'
        WHEN (e.description ~~* '%goaltending%') THEN 'GOALTEND'
        WHEN (e.description ~~* '%challenge%') THEN 'CHALLENGE'
        WHEN (e.description ~~* '%ejected%') THEN 'EJECTION'
        WHEN (e.description ~~* '%jump ball%') THEN 'JUMP_BALL'
        WHEN ((e.description ~~* '%makes%') AND (e.description !~~* '%3-pt%') AND (e.description !~~* '%free throw%')) THEN 'SHOT_MADE_2'
        WHEN ((e.description ~~* '%misses%') AND (e.description !~~* '%3-pt%') AND (e.description !~~* '%free throw%')) THEN 'SHOT_MISSED_2'
        ELSE 'OTHER'
    END AS parsed_event_type,
    pl.id AS resolved_player_id
FROM nba_pbp_events e
LEFT JOIN players pl ON (pl.external_id = e.player_id);

-- 2. pbp_event_participants (depends on pbp_parsed_events + players)
CREATE OR REPLACE VIEW public.pbp_event_participants AS
SELECT pe.event_id,
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
    pl.id AS participant_player_id,
    row_number() OVER (PARTITION BY pe.game_id, pe.event_id ORDER BY part.ordinality) AS participant_order
FROM pbp_parsed_events pe
CROSS JOIN LATERAL jsonb_array_elements(COALESCE((pe.play_json -> 'participants'), '[]'::jsonb)) WITH ORDINALITY part(value, ordinality)
LEFT JOIN players pl ON (pl.external_id = (part.value)::text);

-- 3. pbp_substitution_events (depends on pbp_event_participants)
CREATE OR REPLACE VIEW public.pbp_substitution_events AS
SELECT game_id,
    event_id,
    period,
    clock,
    wallclock,
    team_id,
    description,
    participant_bdl_id,
    participant_player_id,
    participant_order,
    CASE
        WHEN (participant_order = 1) THEN 'PLAYER_IN'
        WHEN (participant_order = 2) THEN 'PLAYER_OUT'
        ELSE 'UNKNOWN'
    END AS substitution_role_guess
FROM pbp_event_participants ep
WHERE (event_type = 'SUBSTITUTION');

-- 4. pbp_stat_deltas (depends on pbp_parsed_events + pbp_event_participants)
CREATE OR REPLACE VIEW public.pbp_stat_deltas AS
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'points'::text AS stat_key, 2::numeric AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_2'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'two_pa'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_2'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'two_pm'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_2'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'two_pa'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MISSED_2'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'points'::text AS stat_key, 3 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_3'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'three_pa'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_3'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'three_pm'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MADE_3'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'three_pa'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'SHOT_MISSED_3'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'points'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'FT_MADE'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'fta'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'FT_MADE'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'ftm'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'FT_MADE'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'fta'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'FT_MISSED'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'oreb'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'REBOUND_OFF' AND pbp_parsed_events.resolved_player_id IS NOT NULL
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'rebounds'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'REBOUND_OFF' AND pbp_parsed_events.resolved_player_id IS NOT NULL
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'dreb'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'REBOUND_DEF' AND pbp_parsed_events.resolved_player_id IS NOT NULL
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'rebounds'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'REBOUND_DEF' AND pbp_parsed_events.resolved_player_id IS NOT NULL
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'turnovers'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = 'TURNOVER'
UNION ALL
SELECT pbp_parsed_events.game_id, pbp_parsed_events.event_id, pbp_parsed_events.period, pbp_parsed_events.clock, pbp_parsed_events.wallclock, pbp_parsed_events.team_id, pbp_parsed_events.resolved_player_id AS player_id, pbp_parsed_events.player_name, 'personal_fouls'::text AS stat_key, 1 AS stat_delta FROM pbp_parsed_events WHERE pbp_parsed_events.parsed_event_type = ANY (ARRAY['FOUL_SHOOTING','FOUL_OFFENSIVE','FOUL_LOOSE_BALL','FOUL_TAKE','FOUL_FLAGRANT','FOUL_PERSONAL'])
UNION ALL
SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id AS player_id, NULL::text AS player_name, 'assists'::text AS stat_key, 1 AS stat_delta FROM pbp_event_participants ep WHERE (ep.event_type = ANY (ARRAY['SHOT_MADE_2','SHOT_MADE_3'])) AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ~~* '%assist%'
UNION ALL
SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id AS player_id, NULL::text AS player_name, 'steals'::text AS stat_key, 1 AS stat_delta FROM pbp_event_participants ep WHERE ep.event_type = 'TURNOVER' AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ~~* '%steal%'
UNION ALL
SELECT ep.game_id, ep.event_id, ep.period, ep.clock, ep.wallclock, ep.team_id, ep.participant_player_id AS player_id, NULL::text AS player_name, 'blocks'::text AS stat_key, 1 AS stat_delta FROM pbp_event_participants ep WHERE (ep.event_type = ANY (ARRAY['SHOT_MISSED_2','SHOT_MISSED_3'])) AND ep.participant_player_id IS NOT NULL AND ep.participant_player_id IS DISTINCT FROM ep.primary_player_id AND ep.description ~~* '%block%';

-- 5. live_player_stats_aggregated (depends on pbp_stat_deltas)
CREATE OR REPLACE VIEW public.live_player_stats_aggregated AS
SELECT game_id, team_id, player_id, max(player_name) AS player_name, period,
    sum(CASE WHEN stat_key = 'points' THEN stat_delta ELSE 0::numeric END) AS points,
    sum(CASE WHEN stat_key = 'rebounds' THEN stat_delta ELSE 0::numeric END) AS rebounds,
    sum(CASE WHEN stat_key = 'assists' THEN stat_delta ELSE 0::numeric END) AS assists,
    sum(CASE WHEN stat_key = 'steals' THEN stat_delta ELSE 0::numeric END) AS steals,
    sum(CASE WHEN stat_key = 'blocks' THEN stat_delta ELSE 0::numeric END) AS blocks,
    sum(CASE WHEN stat_key = 'turnovers' THEN stat_delta ELSE 0::numeric END) AS turnovers,
    sum(CASE WHEN stat_key = 'two_pa' THEN stat_delta ELSE 0::numeric END) AS two_pa,
    sum(CASE WHEN stat_key = 'two_pm' THEN stat_delta ELSE 0::numeric END) AS two_pm,
    sum(CASE WHEN stat_key = 'three_pa' THEN stat_delta ELSE 0::numeric END) AS three_pa,
    sum(CASE WHEN stat_key = 'three_pm' THEN stat_delta ELSE 0::numeric END) AS three_pm,
    sum(CASE WHEN stat_key = 'fta' THEN stat_delta ELSE 0::numeric END) AS fta,
    sum(CASE WHEN stat_key = 'ftm' THEN stat_delta ELSE 0::numeric END) AS ftm,
    sum(CASE WHEN stat_key = 'oreb' THEN stat_delta ELSE 0::numeric END) AS oreb,
    sum(CASE WHEN stat_key = 'dreb' THEN stat_delta ELSE 0::numeric END) AS dreb,
    sum(CASE WHEN stat_key = 'personal_fouls' THEN stat_delta ELSE 0::numeric END) AS personal_fouls
FROM pbp_stat_deltas d
WHERE player_id IS NOT NULL
GROUP BY game_id, team_id, player_id, period;

-- 6. live_player_stats_by_window (depends on live_player_stats_aggregated)
CREATE OR REPLACE VIEW public.live_player_stats_by_window AS
SELECT game_id, team_id, player_id, max(player_name) AS player_name,
    sum(points) AS game_points, sum(rebounds) AS game_rebounds, sum(assists) AS game_assists,
    sum(steals) AS game_steals, sum(blocks) AS game_blocks, sum(turnovers) AS game_turnovers,
    sum(two_pa) AS game_two_pa, sum(two_pm) AS game_two_pm,
    sum(three_pa) AS game_three_pa, sum(three_pm) AS game_three_pm,
    sum(fta) AS game_fta, sum(ftm) AS game_ftm,
    sum(oreb) AS game_oreb, sum(dreb) AS game_dreb,
    sum(points) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_points,
    sum(rebounds) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_rebounds,
    sum(assists) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_assists,
    sum(steals) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_steals,
    sum(blocks) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_blocks,
    sum(turnovers) FILTER (WHERE period = ANY (ARRAY[1, 2])) AS first_half_turnovers,
    sum(points) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_points,
    sum(rebounds) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_rebounds,
    sum(assists) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_assists,
    sum(steals) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_steals,
    sum(blocks) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_blocks,
    sum(turnovers) FILTER (WHERE period = ANY (ARRAY[3, 4])) AS second_half_turnovers,
    sum(points) FILTER (WHERE period = 1) AS q1_points,
    sum(points) FILTER (WHERE period = 2) AS q2_points,
    sum(points) FILTER (WHERE period = 3) AS q3_points,
    sum(points) FILTER (WHERE period = 4) AS q4_points,
    sum(rebounds) FILTER (WHERE period = 1) AS q1_rebounds,
    sum(rebounds) FILTER (WHERE period = 2) AS q2_rebounds,
    sum(rebounds) FILTER (WHERE period = 3) AS q3_rebounds,
    sum(rebounds) FILTER (WHERE period = 4) AS q4_rebounds,
    sum(assists) FILTER (WHERE period = 1) AS q1_assists,
    sum(assists) FILTER (WHERE period = 2) AS q2_assists,
    sum(assists) FILTER (WHERE period = 3) AS q3_assists,
    sum(assists) FILTER (WHERE period = 4) AS q4_assists,
    sum(points) FILTER (WHERE period > 4) AS ot_points,
    sum(rebounds) FILTER (WHERE period > 4) AS ot_rebounds,
    sum(assists) FILTER (WHERE period > 4) AS ot_assists,
    sum(steals) FILTER (WHERE period > 4) AS ot_steals,
    sum(blocks) FILTER (WHERE period > 4) AS ot_blocks,
    sum(turnovers) FILTER (WHERE period > 4) AS ot_turnovers
FROM live_player_stats_aggregated
GROUP BY game_id, team_id, player_id;

-- 7. live_player_fantasy_scores (depends on live_player_stats_by_window)
CREATE OR REPLACE VIEW public.live_player_fantasy_scores AS
SELECT game_id, team_id, player_id, player_name,
    (game_points + (game_rebounds * 1.2) + (game_assists * 1.5) + (game_steals * 3::numeric) + (game_blocks * 3::numeric) - game_turnovers) AS game_fantasy_score,
    (first_half_points + (first_half_rebounds * 1.2) + (first_half_assists * 1.5) + (first_half_steals * 3::numeric) + (first_half_blocks * 3::numeric) - first_half_turnovers) AS first_half_fantasy_score,
    (second_half_points + (second_half_rebounds * 1.2) + (second_half_assists * 1.5) + (second_half_steals * 3::numeric) + (second_half_blocks * 3::numeric) - second_half_turnovers) AS second_half_fantasy_score
FROM live_player_stats_by_window;

-- 8. live_player_tracking_pbp_patch (depends on live_player_stats_by_window + live_player_fantasy_scores + players)
CREATE OR REPLACE VIEW public.live_player_tracking_pbp_patch AS
SELECT s.game_id, s.team_id, s.player_id,
    COALESCE(s.player_name, pl.name) AS player_name,
    s.game_points AS points, s.game_rebounds AS rebounds, s.game_assists AS assists,
    s.game_steals AS steals, s.game_blocks AS blocks, s.game_turnovers AS turnovers,
    s.game_two_pa AS two_pa, s.game_two_pm AS two_pm,
    s.game_three_pa AS three_pa, s.game_three_pm AS three_pm,
    s.game_fta AS fta, s.game_ftm AS ftm,
    s.game_oreb AS oreb, s.game_dreb AS dreb,
    f.game_fantasy_score,
    (s.game_points + (s.game_two_pm + s.game_three_pm) + s.game_ftm - (s.game_two_pa + s.game_three_pa) - s.game_fta + s.game_dreb + (0.5 * s.game_oreb) + s.game_assists + s.game_steals + (0.5 * s.game_blocks) - s.game_turnovers) AS pbp_pie_numerator
FROM live_player_stats_by_window s
LEFT JOIN live_player_fantasy_scores f ON (s.game_id = f.game_id AND s.player_id = f.player_id)
LEFT JOIN players pl ON (pl.id = s.player_id);
