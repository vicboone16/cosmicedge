# SQL to run in Cloud View → Run SQL → select "Live"

## STEP 1: Update today's game scores

```sql
UPDATE games SET home_score = 101, away_score = 105, status = 'final' WHERE id = '843f8cfc-d901-4d30-bec5-9d05e1ced80c';
UPDATE games SET home_score = 112, away_score = 105, status = 'final' WHERE id = '8b969bff-06d8-4c36-bb75-62a0456bb880';
UPDATE games SET home_score = 107, away_score = 117, status = 'final' WHERE id = '11245171-0e97-47c8-9729-126e48dd137e';
UPDATE games SET home_score = 112, away_score = 84, status = 'final' WHERE id = 'cbe488bd-2d64-4037-8015-ea8ecc96b59a';
UPDATE games SET home_score = 111, away_score = 126, status = 'final' WHERE id = '39eaaf21-1039-43de-860b-e9efb6352343';
UPDATE games SET home_score = 101, away_score = 110, status = 'final' WHERE id = '6762af47-6488-4904-86a6-bd4a196fe6dd';
UPDATE games SET home_score = 121, away_score = 94, status = 'final' WHERE id = '242a6761-e72e-44e7-aeb4-70ba84d57eda';
UPDATE games SET home_score = 94, away_score = 131, status = 'final' WHERE id = '102dc73b-fd2e-4a3a-887b-55b248ccecdf';
UPDATE games SET home_score = 110, away_score = 121, status = 'final' WHERE id = 'ecf963ff-389e-4a07-950a-5dfc4395e6cb';
UPDATE games SET home_score = 115, away_score = 114, status = 'final' WHERE id = '67335ab4-f48f-4299-b083-24b965dbd60c';
```

## STEP 2: Unschedule old cron jobs (pointing to wrong URL)

```sql
SELECT cron.unschedule(12);
SELECT cron.unschedule(13);
SELECT cron.unschedule(14);
SELECT cron.unschedule(15);
SELECT cron.unschedule(20);
SELECT cron.unschedule(22);
```

## STEP 3: Reschedule crons pointing to LIVE project URL
Run each one separately.

### 3a. fetch-live-scores (every 2 min)
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

### 3b. fetch-live (every 1 min)
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

### 3c. fetch-odds (every 30 min)
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

### 3d. rebuild-trending (every 5 min)
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

### 3e. sync-scoreboard (every 10 min)
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
