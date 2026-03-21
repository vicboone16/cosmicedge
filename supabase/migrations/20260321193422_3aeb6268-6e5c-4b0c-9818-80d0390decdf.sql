-- Fix DST offset: NBA schedule was ingested with EST (UTC-5) instead of EDT (UTC-4).
-- Subtract 1 hour from all NBA games from March 8 2026 (DST start) through Nov 1 2026 (DST end).
UPDATE public.games
SET start_time = start_time - interval '1 hour',
    updated_at = now()
WHERE league = 'NBA'
  AND source = 'nba_schedule'
  AND start_time >= '2026-03-08T00:00:00Z'
  AND start_time < '2026-11-02T00:00:00Z';