-- ─────────────────────────────────────────────────────────────
-- Cron: fetch NBA player props twice daily
--   • 14:00 UTC (10 AM ET) — first lines usually posted by now
--   • 21:00 UTC (5 PM ET) — refresh before tipoff surge
-- ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('fetch-player-props-noon')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-player-props-noon');
SELECT cron.unschedule('fetch-player-props-evening') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-player-props-evening');

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

-- ─────────────────────────────────────────────────────────────
-- Helper: run nebula-prop-engine for every scheduled NBA game
--   Iterates today's games and fires one POST per game_id.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_nebula_for_today_games()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  rec RECORD;
  endpoint TEXT;
  svc_key  TEXT;
BEGIN
  endpoint := current_setting('supabase_functions_endpoint', true);
  svc_key  := current_setting('supabase.service_role_key', true);

  IF endpoint IS NULL OR svc_key IS NULL THEN
    RAISE WARNING 'nebula batch: missing endpoint or service key — skipping';
    RETURN;
  END IF;

  FOR rec IN
    SELECT id
    FROM   public.games
    WHERE  league    = 'NBA'
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

-- ─────────────────────────────────────────────────────────────
-- Cron: run nebula-prop-engine for all today's NBA games
--   • 15:00 UTC — after noon props ingest completes
--   • 22:00 UTC — refresh evening lines before tipoff
-- ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('nebula-prop-engine-afternoon') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nebula-prop-engine-afternoon');
SELECT cron.unschedule('nebula-prop-engine-evening')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nebula-prop-engine-evening');

SELECT cron.schedule(
  'nebula-prop-engine-afternoon',
  '0 15 * * *',
  $$ SELECT public.run_nebula_for_today_games(); $$
);

SELECT cron.schedule(
  'nebula-prop-engine-evening',
  '0 22 * * *',
  $$ SELECT public.run_nebula_for_today_games(); $$
);

-- ─────────────────────────────────────────────────────────────
-- Cron: daily BDL player-stats backfill (keep player_game_stats current)
--   Runs at 07:00 UTC (after most overnight games have been scored)
-- ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('bdl-backfill-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bdl-backfill-daily');

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
    body    := jsonb_build_object('date', to_char(now() - INTERVAL '1 day', 'YYYY-MM-DD'), 'season', 2025)
  );
  $$
);
