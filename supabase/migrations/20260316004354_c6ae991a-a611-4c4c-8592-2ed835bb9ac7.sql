/* =========================================================
   PATCH: Player validity + live pace/PIE enhancement views
   Maps to actual schema tables
   ========================================================= */

-- 1. Current game players: joins games + depth_charts for active games
DROP VIEW IF EXISTS v_current_game_players CASCADE;
CREATE VIEW v_current_game_players AS
SELECT DISTINCT
    g.id AS game_id,
    dc.player_id,
    dc.player_name,
    dc.team_abbr,
    g.league
FROM games g
JOIN depth_charts dc
    ON dc.league = g.league
   AND (dc.team_abbr = g.home_abbr OR dc.team_abbr = g.away_abbr)
WHERE COALESCE(g.status, '') IN ('live', 'in_progress', 'halftime', 'scheduled');

-- 2. Player validity: cross-check with player_game_stats presence
DROP VIEW IF EXISTS v_oracle_player_validity CASCADE;
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

-- 3. Live game pace from player_game_stats (team-level aggregate)
DROP VIEW IF EXISTS v_live_game_pace CASCADE;
CREATE VIEW v_live_game_pace AS
SELECT
    pgs.game_id,
    pgs.team_abbr,
    SUM(COALESCE(pgs.fg_attempted, 0)) AS team_fga,
    SUM(COALESCE(pgs.off_rebounds, 0)) AS team_oreb,
    SUM(COALESCE(pgs.turnovers, 0)) AS team_tov,
    SUM(COALESCE(pgs.ft_attempted, 0)) AS team_fta,
    -- Possessions estimate
    SUM(COALESCE(pgs.fg_attempted, 0))
      - SUM(COALESCE(pgs.off_rebounds, 0))
      + SUM(COALESCE(pgs.turnovers, 0))
      + 0.44 * SUM(COALESCE(pgs.ft_attempted, 0)) AS est_possessions,
    -- Minutes played by team (sum of player minutes)
    SUM(COALESCE(pgs.minutes, 0)) AS total_player_minutes,
    -- Pace = 48 * possessions / (team_minutes / 5)
    CASE
        WHEN SUM(COALESCE(pgs.minutes, 0)) > 0 THEN
            48.0 * (
                SUM(COALESCE(pgs.fg_attempted, 0))
                - SUM(COALESCE(pgs.off_rebounds, 0))
                + SUM(COALESCE(pgs.turnovers, 0))
                + 0.44 * SUM(COALESCE(pgs.ft_attempted, 0))
            ) / (SUM(COALESCE(pgs.minutes, 0))::numeric / 5.0)
        ELSE NULL
    END AS current_pace
FROM player_game_stats pgs
WHERE pgs.period = 'full'
GROUP BY pgs.game_id, pgs.team_abbr;

-- 4. Live PIE components from player_game_stats
DROP VIEW IF EXISTS v_live_player_pie CASCADE;
CREATE VIEW v_live_player_pie AS
WITH pie_raw AS (
    SELECT
        pgs.game_id,
        pgs.player_id,
        pgs.team_abbr,
        COALESCE(pgs.points, 0) AS pts,
        COALESCE(pgs.fg_made, 0) AS fgm,
        COALESCE(pgs.fg_attempted, 0) AS fga,
        COALESCE(pgs.ft_made, 0) AS ftm,
        COALESCE(pgs.ft_attempted, 0) AS fta,
        COALESCE(pgs.def_rebounds, 0) AS dreb,
        COALESCE(pgs.off_rebounds, 0) AS oreb,
        COALESCE(pgs.assists, 0) AS ast,
        COALESCE(pgs.steals, 0) AS stl,
        COALESCE(pgs.blocks, 0) AS blk,
        COALESCE(pgs.personal_fouls, COALESCE(pgs.fouls, 0)) AS pf,
        COALESCE(pgs.turnovers, 0) AS tov,
        COALESCE(pgs.plus_minus, 0) AS plus_minus,
        COALESCE(pgs.minutes, 0) AS minutes,
        -- PIE numerator
        (
            COALESCE(pgs.points, 0)
            + COALESCE(pgs.fg_made, 0)
            + COALESCE(pgs.ft_made, 0)
            - COALESCE(pgs.fg_attempted, 0)
            - COALESCE(pgs.ft_attempted, 0)
            + COALESCE(pgs.def_rebounds, 0)
            + 0.5 * COALESCE(pgs.off_rebounds, 0)
            + COALESCE(pgs.assists, 0)
            + COALESCE(pgs.steals, 0)
            + 0.5 * COALESCE(pgs.blocks, 0)
            - COALESCE(pgs.personal_fouls, COALESCE(pgs.fouls, 0))
            - COALESCE(pgs.turnovers, 0)
        ) AS pie_numerator
    FROM player_game_stats pgs
    WHERE pgs.period = 'full'
)
SELECT
    r.game_id,
    r.player_id,
    r.team_abbr,
    r.pts,
    r.fgm,
    r.fga,
    r.ftm,
    r.fta,
    r.dreb,
    r.oreb,
    r.ast,
    r.stl,
    r.blk,
    r.pf,
    r.tov,
    r.plus_minus,
    r.minutes,
    r.pie_numerator,
    SUM(r.pie_numerator) OVER (PARTITION BY r.game_id) AS total_game_pie,
    CASE
        WHEN SUM(r.pie_numerator) OVER (PARTITION BY r.game_id) <> 0
        THEN ROUND((r.pie_numerator / SUM(r.pie_numerator) OVER (PARTITION BY r.game_id))::numeric, 4)
        ELSE NULL
    END AS live_pie
FROM pie_raw r;

-- 5. Enhanced prop overlay view: wraps np_v_prop_overlay + validity + pace + PIE
DROP VIEW IF EXISTS v_prop_overlay_enhanced CASCADE;
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