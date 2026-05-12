-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: burst-loop crons used app.supabase_url / app.service_role_key which
-- require manual DB ALTER DATABASE config.  Rewrite them to use
-- supabase_functions_endpoint / supabase.service_role_key — the auto-
-- configured settings Supabase sets on every project.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'nba-bdl-burst-loop-cron',
  'pbp-watch-sync-cron'
);

-- ─── NBA BDL Burst Loop — every minute ───────────────────────────────────────
SELECT cron.schedule(
  'nba-bdl-burst-loop-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('supabase_functions_endpoint') || '/nba-bdl-burst-loop',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─── PBP Watch Sync — every 2 minutes ────────────────────────────────────────
SELECT cron.schedule(
  'pbp-watch-sync-cron',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('supabase_functions_endpoint') || '/pbp-watch-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
