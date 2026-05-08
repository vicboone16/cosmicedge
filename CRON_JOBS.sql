-- ============================================================
-- CosmicEdge — Scheduled Cron Jobs
-- Run this entire file in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Fetch NBA player prop lines at noon ET
SELECT cron.schedule(
  'fetch-player-props-noon',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('supabase_functions_endpoint') || '/fetch-player-props',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 2. Refresh NBA player prop lines at 5 PM ET (before tipoff)
SELECT cron.schedule(
  'fetch-player-props-evening',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('supabase_functions_endpoint') || '/fetch-player-props',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 3. Helper function: run nebula-prop-engine for every NBA game today
CREATE OR REPLACE FUNCTION public.run_nebula_for_today_games()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  rec      RECORD;
  endpoint TEXT;
  svc_key  TEXT;
BEGIN
  endpoint := current_setting('supabase_functions_endpoint', true);
  svc_key  := current_setting('supabase.service_role_key', true);
  IF endpoint IS NULL OR svc_key IS NULL THEN
    RAISE WARNING 'nebula batch: missing endpoint or service key';
    RETURN;
  END IF;
  FOR rec IN
    SELECT id FROM public.games
    WHERE  league   = 'NBA'
      AND  status   IN ('scheduled', 'live', 'in_progress')
      AND  start_time >= NOW() - INTERVAL '3 hours'
      AND  start_time <= NOW() + INTERVAL '18 hours'
  LOOP
    PERFORM net.http_post(
      url     := endpoint || '/nebula-prop-engine',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body    := jsonb_build_object('game_id', rec.id)
    );
  END LOOP;
END;
$$;

-- 4. Run nebula predictions at 3 PM ET (after noon props ingest)
SELECT cron.schedule(
  'nebula-prop-engine-afternoon',
  '0 15 * * *',
  $$ SELECT public.run_nebula_for_today_games(); $$
);

-- 5. Run nebula predictions at 6 PM ET (after evening props refresh)
SELECT cron.schedule(
  'nebula-prop-engine-evening',
  '0 22 * * *',
  $$ SELECT public.run_nebula_for_today_games(); $$
);

-- 6. Backfill yesterday's player game stats every morning at 7 AM UTC
SELECT cron.schedule(
  'bdl-backfill-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('supabase_functions_endpoint') || '/bdl-backfill-day',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body    := jsonb_build_object(
      'date',   to_char(now() - INTERVAL '1 day', 'YYYY-MM-DD'),
      'season', 2025
    )
  );
  $$
);
