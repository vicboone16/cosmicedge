-- Drop dependent view first, then the base view
DROP VIEW IF EXISTS public.v_game_live_state CASCADE;
DROP VIEW IF EXISTS public.v_game_latest_snapshot CASCADE;

-- Recreate both views
CREATE OR REPLACE VIEW public.v_game_latest_snapshot AS
SELECT DISTINCT ON (game_id)
    game_id,
    home_score,
    away_score,
    quarter,
    clock,
    clock_seconds_remaining,
    possession,
    captured_at
FROM game_state_snapshots s
ORDER BY game_id, captured_at DESC;

CREATE OR REPLACE VIEW public.v_game_live_state AS
SELECT
    g.id AS game_id,
    g.home_team,
    g.away_team,
    g.home_abbr,
    g.away_abbr,
    g.status,
    ls.home_score,
    ls.away_score,
    ls.quarter,
    ls.clock,
    ls.clock_seconds_remaining,
    ls.possession,
    ls.captured_at AS last_snapshot_at
FROM games g
LEFT JOIN v_game_latest_snapshot ls ON ls.game_id = g.id;