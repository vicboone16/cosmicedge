-- Schedule the live score fetching function to run every 2 minutes
SELECT cron.schedule(
  'fetch-live-scores-cron',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xilxyiijgnadlbabytfn.supabase.co/functions/v1/fetch-live-scores',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpbHh5aWlqZ25hZGxiYWJ5dGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzE5OTgsImV4cCI6MjA4NjYwNzk5OH0.FQB094Jh4jLC7RarMpftMchJf4y6a_A4t5S643iNYuk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);