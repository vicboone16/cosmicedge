-- Align Test PBP view SQL text to Live to prevent publish diff from rebuilding chain in wrong order
CREATE OR REPLACE VIEW public.live_player_stats_aggregated AS
SELECT
    game_id,
    team_id,
    player_id,
    max(player_name) AS player_name,
    period,
    sum(CASE WHEN (stat_key = 'points'::text) THEN stat_delta ELSE (0)::numeric END) AS points,
    sum(CASE WHEN (stat_key = 'rebounds'::text) THEN stat_delta ELSE (0)::numeric END) AS rebounds,
    sum(CASE WHEN (stat_key = 'assists'::text) THEN stat_delta ELSE (0)::numeric END) AS assists,
    sum(CASE WHEN (stat_key = 'steals'::text) THEN stat_delta ELSE (0)::numeric END) AS steals,
    sum(CASE WHEN (stat_key = 'blocks'::text) THEN stat_delta ELSE (0)::numeric END) AS blocks,
    sum(CASE WHEN (stat_key = 'turnovers'::text) THEN stat_delta ELSE (0)::numeric END) AS turnovers,
    sum(CASE WHEN (stat_key = 'two_pa'::text) THEN stat_delta ELSE (0)::numeric END) AS two_pa,
    sum(CASE WHEN (stat_key = 'two_pm'::text) THEN stat_delta ELSE (0)::numeric END) AS two_pm,
    sum(CASE WHEN (stat_key = 'three_pa'::text) THEN stat_delta ELSE (0)::numeric END) AS three_pa,
    sum(CASE WHEN (stat_key = 'three_pm'::text) THEN stat_delta ELSE (0)::numeric END) AS three_pm,
    sum(CASE WHEN (stat_key = 'fta'::text) THEN stat_delta ELSE (0)::numeric END) AS fta,
    sum(CASE WHEN (stat_key = 'ftm'::text) THEN stat_delta ELSE (0)::numeric END) AS ftm,
    sum(CASE WHEN (stat_key = 'oreb'::text) THEN stat_delta ELSE (0)::numeric END) AS oreb,
    sum(CASE WHEN (stat_key = 'dreb'::text) THEN stat_delta ELSE (0)::numeric END) AS dreb,
    sum(CASE WHEN (stat_key = 'personal_fouls'::text) THEN stat_delta ELSE (0)::numeric END) AS personal_fouls
FROM pbp_stat_deltas
WHERE (player_id IS NOT NULL)
GROUP BY game_id, team_id, player_id, period;

CREATE OR REPLACE VIEW public.pbp_substitution_events AS
SELECT
    game_id,
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
        WHEN (participant_order = 1) THEN 'PLAYER_IN'::text
        WHEN (participant_order = 2) THEN 'PLAYER_OUT'::text
        ELSE 'UNKNOWN'::text
    END AS substitution_role_guess
FROM pbp_event_participants
WHERE (event_type = 'SUBSTITUTION'::text);

ALTER VIEW public.live_player_stats_aggregated RESET (security_invoker);
ALTER VIEW public.pbp_substitution_events RESET (security_invoker);