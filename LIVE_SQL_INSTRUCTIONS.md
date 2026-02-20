# SQL to run in Cloud View → Run SQL

## Current State (as of 2026-02-20)

### Live Crons (ACTIVE - IDs 28-40) ✅
All 13 production crons are running correctly targeting the Live project URL (`gwfgmlfggeyxexclwybk`).

| ID | Name | Schedule |
|----|------|----------|
| 28 | fetch-live-scores-live | */2 * * * * |
| 29 | fetch-live-live | * * * * * |
| 30 | fetch-odds-live | */30 * * * * |
| 31 | rebuild-trending-live | */5 * * * * |
| 32 | sync-scoreboard-live | */10 * * * * |
| 33 | sgo-upcoming-poll-live | 0 6 * * * |
| 34 | sgo-smart-dispatch-live | * * * * * |
| 35 | astro-batch-live | */15 * * * * |
| 36 | period-stats-live | 0 7 * * * |
| 37 | scoreboard-backfill-live | 30 3 * * * |
| 38 | nba-boxscores-live | */30 * * * * |
| 39 | sportsline-picks-live | 0 15 * * * |
| 40 | balldontlie-live | 30 2 * * * |

### Test Crons (TO BE REMOVED - IDs 5-20)
These are redundant crons in the Test DB that waste API quota. Run each unschedule in Cloud View → Run SQL → **Test**:

```sql
SELECT cron.unschedule(5);
SELECT cron.unschedule(6);
SELECT cron.unschedule(7);
SELECT cron.unschedule(8);
SELECT cron.unschedule(9);
SELECT cron.unschedule(10);
SELECT cron.unschedule(11);
SELECT cron.unschedule(12);
SELECT cron.unschedule(14);
SELECT cron.unschedule(15);
SELECT cron.unschedule(16);
SELECT cron.unschedule(17);
SELECT cron.unschedule(18);
SELECT cron.unschedule(19);
SELECT cron.unschedule(20);
```

---

## Reference: Live Cron Creation SQL

If you ever need to recreate the Live crons, run these in Cloud View → Run SQL → **Live**.
All use the Live project URL and anon key.

### fetch-live-scores-live (every 2 min)
```sql
SELECT cron.schedule(
  'fetch-live-scores-live',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/fetch-live-scores',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### fetch-live-live (every 1 min)
```sql
SELECT cron.schedule(
  'fetch-live-live',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/fetch-live',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{"mode":"live"}'::jsonb
  ) AS request_id;
  $$
);
```

### fetch-odds-live (every 30 min)
```sql
SELECT cron.schedule(
  'fetch-odds-live',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/fetch-odds',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### rebuild-trending-live (every 5 min)
```sql
SELECT cron.schedule(
  'rebuild-trending-live',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/rebuild-trending',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### sync-scoreboard-live (every 10 min)
```sql
SELECT cron.schedule(
  'sync-scoreboard-live',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sync-scoreboard',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### sgo-upcoming-poll-live (daily 6am)
```sql
SELECT cron.schedule(
  'sgo-upcoming-poll-live',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/fetch-sgo-live?feed=events:upcoming',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### sgo-smart-dispatch-live (every 1 min)
```sql
SELECT cron.schedule(
  'sgo-smart-dispatch-live',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sgo-dispatcher',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### astro-batch-live (every 15 min)
```sql
SELECT cron.schedule(
  'astro-batch-live',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/astro-batch',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### period-stats-live (daily 7am)
```sql
SELECT cron.schedule(
  'period-stats-live',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/aggregate-period-stats',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### scoreboard-backfill-live (daily 3:30am)
```sql
SELECT cron.schedule(
  'scoreboard-backfill-live',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sync-scoreboard',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{"backfill":true}'::jsonb
  ) AS request_id;
  $$
);
```

### nba-boxscores-live (every 30 min)
```sql
SELECT cron.schedule(
  'nba-boxscores-live',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sync-nba-boxscores',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### sportsline-picks-live (daily 3pm)
```sql
SELECT cron.schedule(
  'sportsline-picks-live',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sync-sportsline-picks',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### balldontlie-live (daily 2:30am)
```sql
SELECT cron.schedule(
  'balldontlie-live',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gwfgmlfggeyxexclwybk.supabase.co/functions/v1/sync-balldontlie',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZmdtbGZnZ2V5eGV4Y2x3eWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDA1NDQsImV4cCI6MjA4NjUxNjU0NH0.oWZskdzWyLz_uO2VXUfGbbyasBhRs5HBRvTWFhMBrMA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```
