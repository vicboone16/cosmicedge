-- Sweep stale games stuck in 'live'/'in_progress' that started before March 18
UPDATE games
SET status = 'final', updated_at = now()
WHERE status IN ('live', 'in_progress')
  AND start_time < '2026-03-18 00:00:00+00';