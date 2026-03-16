-- Fix: use players.team for roster membership instead of depth_charts
DROP VIEW IF EXISTS v_prop_overlay_enhanced CASCADE;
DROP VIEW IF EXISTS v_oracle_player_validity CASCADE;
DROP VIEW IF EXISTS v_current_game_players CASCADE;

-- Current game players using players table (team field)
CREATE VIEW v_current_game_players AS
SELECT DISTINCT
    g.id AS game_id,
    p.id AS player_id,
    p.name AS player_name,
    p.team AS team_abbr,
    g.league
FROM games g
JOIN players p
    ON p.league = g.league
   AND (UPPER(p.team) = UPPER(g.home_abbr) OR UPPER(p.team) = UPPER(g.away_abbr))
WHERE COALESCE(g.status, '') IN ('live', 'in_progress', 'halftime', 'scheduled');

-- Player validity: cross-check with player_game_stats
CREATE VIEW v_oracle_player_validity AS
SELECT
    c.game_id,
    c.player_id,
    c.player_name,
    c.team_abbr,
    c.league,
    CASE
        WHEN pgs.player_id IS NOT NULL THEN TRUE
        ELSE FALSE
    END AS is_valid_live_player,
    COALESCE(pgs.minutes, 0) AS live_minutes,
    COALESCE(pgs.points, 0) AS live_points,
    COALESCE(pgs.plus_minus, 0) AS plus_minus
FROM v_current_game_players c
LEFT JOIN player_game_stats pgs
    ON pgs.game_id = c.game_id
   AND pgs.player_id = c.player_id
   AND pgs.period = 'full';

-- Re-create enhanced overlay
CREATE VIEW v_prop_overlay_enhanced AS
SELECT
    o.*,
    v.is_valid_live_player,
    v.live_minutes AS validity_minutes,
    v.plus_minus,
    pace.current_pace,
    pace.est_possessions,
    pie.live_pie,
    pie.pie_numerator
FROM np_v_prop_overlay o
LEFT JOIN v_oracle_player_validity v
    ON o.game_id = v.game_id
   AND o.player_id = v.player_id
LEFT JOIN v_live_game_pace pace
    ON o.game_id = pace.game_id
   AND o.player_team = pace.team_abbr
LEFT JOIN v_live_player_pie pie
    ON o.game_id = pie.game_id
   AND o.player_id = pie.player_id;