-- ─────────────────────────────────────────────────────────────────────────────
-- Live NBA Data Pipeline — Cron Jobs
--
-- nba-bdl-burst-loop: Runs every minute. Calls BDL live scoreboard API,
--   writes game_state_snapshots (quarter + score + clock), game_quarters
--   (per-period breakdown), and nba_pbp_events (play-by-play). This is the
--   primary engine for all live NBA features: quarter scores, pace calculator,
--   PBP Watch, and win probability updates.
--
-- pbp-watch-sync: Runs every 2 minutes. Normalizes raw PBP events into the
--   pbp_events table for the Watch tab and derives pbp_quarter_team_stats.
--
-- IMPORTANT: These jobs use current_setting('app.supabase_url') and
-- current_setting('app.service_role_key') — set via Supabase Dashboard →
-- Settings → Database → Extensions → pg_cron → Custom Settings, or run:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove stale versions if they exist
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'nba-bdl-burst-loop-cron',
  'pbp-watch-sync-cron'
);

-- ─── NBA BDL Burst Loop — every minute ───────────────────────────────────────
-- Ingests: live scores → game_state_snapshots, game_quarters, nba_pbp_events
-- Required for: quarter scores, pace calculator, PBP Watch, win probability
SELECT cron.schedule(
  'nba-bdl-burst-loop-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/nba-bdl-burst-loop',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─── PBP Watch Sync — every 2 minutes ────────────────────────────────────────
-- Normalizes nba_pbp_events → pbp_events, derives pbp_quarter_team_stats
-- Required for: Watch tab, cosmic game key lookup, per-quarter team stats
SELECT cron.schedule(
  'pbp-watch-sync-cron',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/pbp-watch-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
