
-- Daily cron: backfill quarter stats for today's completed games
SELECT cron.schedule(
  'bdl-quarter-stats-daily',
  '30 6 * * *',  -- 6:30 AM UTC (after most NBA games are done)
  $$
  SELECT net.http_post(
    url := current_setting('supabase_functions_endpoint') || '/bdl-quarter-stats?date=' || to_char(now(), 'YYYY-MM-DD') || '&season=2025',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
