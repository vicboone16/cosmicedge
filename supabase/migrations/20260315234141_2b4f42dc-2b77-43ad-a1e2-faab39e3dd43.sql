
-- Drop in dependency order (top → bottom)
DROP VIEW IF EXISTS fantasy_scores;
DROP VIEW IF EXISTS player_stats_by_window;

-- Recreate player_stats_by_window from existing player_game_stats
CREATE OR REPLACE VIEW player_stats_by_window AS
SELECT
  game_id,
  player_id,
  team_abbr,
  COALESCE(points, 0) AS game_points,
  COALESCE(rebounds, 0) AS rebounds,
  COALESCE(assists, 0) AS assists,
  COALESCE(steals, 0) AS steals,
  COALESCE(blocks, 0) AS blocks,
  COALESCE(turnovers, 0) AS turnovers,
  COALESCE(three_made, 0) AS three_made,
  COALESCE(minutes, 0) AS minutes
FROM player_game_stats
WHERE period = 'full';

-- Recreate fantasy_scores (FanDuel/DraftKings/PrizePicks scoring)
CREATE OR REPLACE VIEW fantasy_scores AS
SELECT
  game_id,
  player_id,
  team_abbr,
  game_points
    + rebounds * 1.2
    + assists * 1.5
    + steals * 3
    + blocks * 3
    - turnovers AS fantasy_score,
  game_points,
  rebounds,
  assists,
  steals,
  blocks,
  turnovers
FROM player_stats_by_window;
