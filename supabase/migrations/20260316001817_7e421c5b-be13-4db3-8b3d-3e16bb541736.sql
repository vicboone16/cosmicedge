-- Reset tracked_props that were falsely settled with 0 stats back to pregame
UPDATE tracked_props 
SET status = 'pregame', result_direction = NULL, settled_at = NULL, live_stat_value = NULL, progress = NULL
WHERE status IN ('hit','missed','final') 
  AND (live_stat_value = 0 OR live_stat_value IS NULL)
  AND settled_at IS NOT NULL;

-- Also reset bet_slip_picks that were falsely settled with 0 live_value
UPDATE bet_slip_picks
SET result = NULL, live_value = NULL, progress = NULL
WHERE result IS NOT NULL
  AND (live_value = 0 OR live_value IS NULL);