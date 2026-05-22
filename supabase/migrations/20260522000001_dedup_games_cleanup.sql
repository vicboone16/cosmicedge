-- ============================================================================
-- Cleanup duplicate game records and add dedup_key unique index
-- Root cause: Multiple ingestion pipelines (TSDB, SDIO, manual, oddsapi)
-- created separate rows for the same game with different external_ids.
-- Fix: Keep the oldest record (which has BDL mappings, PBP, snapshots)
-- and re-point any FK references from duplicates before deleting them.
-- ============================================================================

-- Step 1: Identify duplicates and pick the canonical (oldest) record per dedup_key
CREATE TEMP TABLE _dup_canonical AS
WITH ranked AS (
  SELECT
    id,
    dedup_key,
    ROW_NUMBER() OVER (
      PARTITION BY dedup_key
      ORDER BY created_at ASC  -- keep the oldest (usually has BDL mapping)
    ) AS rn
  FROM games
  WHERE dedup_key IS NOT NULL
)
SELECT id, dedup_key
FROM ranked
WHERE rn = 1
  AND dedup_key IN (
    SELECT dedup_key FROM games
    WHERE dedup_key IS NOT NULL
    GROUP BY dedup_key HAVING COUNT(*) > 1
  );

-- Step 2: Build a mapping of duplicate IDs → canonical IDs
CREATE TEMP TABLE _dup_mapping AS
SELECT
  g.id AS dup_id,
  c.id AS canonical_id,
  g.dedup_key
FROM games g
JOIN _dup_canonical c ON c.dedup_key = g.dedup_key AND c.id != g.id;

-- Step 3: Re-point foreign key references from duplicates to canonical records
-- (game_state_snapshots)
UPDATE game_state_snapshots SET game_id = m.canonical_id
FROM _dup_mapping m WHERE game_state_snapshots.game_id = m.dup_id;

-- (game_quarters)
UPDATE game_quarters SET game_id = m.canonical_id
FROM _dup_mapping m WHERE game_quarters.game_id = m.dup_id;

-- (nba_pbp_events - uses game_key column)
UPDATE nba_pbp_events SET game_key = m.canonical_id
FROM _dup_mapping m WHERE nba_pbp_events.game_key = m.dup_id;

-- (provider_game_map)
UPDATE provider_game_map SET game_key = m.canonical_id
FROM _dup_mapping m WHERE provider_game_map.game_key = m.dup_id;

-- (player_game_stats)
UPDATE player_game_stats SET game_id = m.canonical_id
FROM _dup_mapping m WHERE player_game_stats.game_id = m.dup_id
AND NOT EXISTS (
  SELECT 1 FROM player_game_stats pgs2
  WHERE pgs2.game_id = m.canonical_id
    AND pgs2.player_id = player_game_stats.player_id
    AND pgs2.period = player_game_stats.period
);

-- Delete player_game_stats that would cause unique constraint violations
DELETE FROM player_game_stats
USING _dup_mapping m
WHERE player_game_stats.game_id = m.dup_id;

-- (nba_player_props_live)
UPDATE nba_player_props_live SET game_id = m.canonical_id
FROM _dup_mapping m WHERE nba_player_props_live.game_id = m.dup_id;

-- (bet_slip_picks)
UPDATE bet_slip_picks SET game_id = m.canonical_id
FROM _dup_mapping m WHERE bet_slip_picks.game_id = m.dup_id;

-- (historical_odds)
UPDATE historical_odds SET game_id = m.canonical_id
FROM _dup_mapping m WHERE historical_odds.game_id = m.dup_id;

-- Step 4: Delete duplicate game records
DELETE FROM games
USING _dup_mapping m
WHERE games.id = m.dup_id;

-- Step 5: Add unique index on dedup_key to prevent future duplicates at DB level
-- Using a partial index (WHERE dedup_key IS NOT NULL) to allow NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_dedup_key_unique
  ON games (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Cleanup temp tables
DROP TABLE IF EXISTS _dup_mapping;
DROP TABLE IF EXISTS _dup_canonical;
