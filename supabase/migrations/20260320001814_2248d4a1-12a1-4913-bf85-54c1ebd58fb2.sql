-- Fix NHL schedule times: PST was stored as UTC (8 hour offset)
-- Fix future scheduled NHL games
UPDATE games 
SET start_time = start_time + interval '8 hours',
    updated_at = now()
WHERE league = 'NHL' 
  AND start_time >= '2026-03-19'
  AND start_time < '2026-07-01'
  AND status = 'scheduled';

-- Fix past NHL games from this season that had the same offset
UPDATE games 
SET start_time = start_time + interval '8 hours',
    updated_at = now()
WHERE league = 'NHL' 
  AND start_time >= '2025-10-01'
  AND start_time < '2026-03-19'
  AND status IN ('scheduled', 'final')
  AND extract(hour from start_time) < 16