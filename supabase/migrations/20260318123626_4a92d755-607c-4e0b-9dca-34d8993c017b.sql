-- Fix stale NCAAB games stuck as 'live' (start_time > 5 hours ago)
UPDATE public.games
SET status = 'final', updated_at = now()
WHERE league = 'NCAAB'
  AND status = 'live'
  AND start_time < now() - interval '5 hours';