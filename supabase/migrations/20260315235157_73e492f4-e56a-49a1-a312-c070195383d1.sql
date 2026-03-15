
-- Fix views for prod deployment: drop in dependency order, recreate
DROP VIEW IF EXISTS fantasy_scores CASCADE;
DROP VIEW IF EXISTS player_stats_by_window CASCADE;

-- Recreate player_stats_by_window with all columns
CREATE OR REPLACE VIEW player_stats_by_window AS
SELECT
  pgs.game_id,
  pgs.player_id,
  p.name AS player_name,
  pgs.team_abbr,
  -- Full game
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.points, 0) END) AS game_points,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.rebounds, 0) END) AS rebounds,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.assists, 0) END) AS assists,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.steals, 0) END) AS steals,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.blocks, 0) END) AS blocks,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.turnovers, 0) END) AS turnovers,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.three_made, 0) END) AS three_made,
  MAX(CASE WHEN pgs.period = 'full' THEN COALESCE(pgs.minutes, 0) END) AS minutes,
  -- Quarter breakdowns
  MAX(CASE WHEN pgs.period = 'q1' THEN COALESCE(pgs.points, 0) END) AS q1_points,
  MAX(CASE WHEN pgs.period = 'q2' THEN COALESCE(pgs.points, 0) END) AS q2_points,
  MAX(CASE WHEN pgs.period = 'q3' THEN COALESCE(pgs.points, 0) END) AS q3_points,
  MAX(CASE WHEN pgs.period = 'q4' THEN COALESCE(pgs.points, 0) END) AS q4_points,
  -- Half breakdowns
  COALESCE(MAX(CASE WHEN pgs.period = '1h' THEN pgs.points END),
    COALESCE(MAX(CASE WHEN pgs.period = 'q1' THEN pgs.points END), 0) +
    COALESCE(MAX(CASE WHEN pgs.period = 'q2' THEN pgs.points END), 0)
  ) AS first_half_points,
  COALESCE(MAX(CASE WHEN pgs.period = '2h' THEN pgs.points END),
    COALESCE(MAX(CASE WHEN pgs.period = 'q3' THEN pgs.points END), 0) +
    COALESCE(MAX(CASE WHEN pgs.period = 'q4' THEN pgs.points END), 0)
  ) AS second_half_points
FROM player_game_stats pgs
JOIN players p ON p.id = pgs.player_id
GROUP BY pgs.game_id, pgs.player_id, p.name, pgs.team_abbr;

-- Recreate fantasy_scores
CREATE OR REPLACE VIEW fantasy_scores AS
SELECT
  s.game_id,
  s.player_id,
  s.player_name,
  s.team_abbr,
  r.sportsbook,
  ROUND((
    COALESCE(s.game_points, 0) * r.points_weight +
    COALESCE(s.rebounds, 0) * r.rebounds_weight +
    COALESCE(s.assists, 0) * r.assists_weight +
    COALESCE(s.steals, 0) * r.steals_weight +
    COALESCE(s.blocks, 0) * r.blocks_weight +
    COALESCE(s.turnovers, 0) * r.turnovers_weight
  )::numeric, 1) AS fantasy_score,
  s.game_points,
  s.rebounds,
  s.assists,
  s.steals,
  s.blocks,
  s.turnovers,
  s.first_half_points,
  s.second_half_points,
  s.q1_points, s.q2_points, s.q3_points, s.q4_points
FROM player_stats_by_window s
CROSS JOIN fantasy_scoring_rules r;
