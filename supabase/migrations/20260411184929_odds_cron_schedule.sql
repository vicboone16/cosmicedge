-- ─────────────────────────────────────────────────────────────────────────────
-- Odds API Cron Schedule
-- Registers pg_cron jobs to fetch odds across all game slates and leagues.
-- These call Supabase Edge Functions via net.http_post.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Enable pg_net for HTTP calls from pg_cron
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Helper: build Edge Function URL ─────────────────────────────────────────
-- Supabase project ref is embedded via the service_role anon key environment.
-- We use the project URL stored as a DB setting or fall back to the known ref.

-- ─── Remove stale cron jobs if they exist (idempotent) ───────────────────────
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'fetch-odds-every-15min',
  'fetch-player-props-nba',
  'fetch-player-props-nfl',
  'fetch-player-props-mlb',
  'fetch-player-props-nhl',
  'fetch-live-odds-every-5min',
  'fetch-live-scores-every-2min',
  'fetch-live-props-every-3min',
  'settle-completed-bets-hourly'
);

-- ─── Odds fetch every 15 minutes (pre-game lines, all leagues) ───────────────
SELECT cron.schedule(
  'fetch-odds-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-odds',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"leagues":["NBA","NFL","MLB","NHL"]}'::jsonb
  );
  $$
);

-- ─── Player props: NBA every 20 minutes ──────────────────────────────────────
SELECT cron.schedule(
  'fetch-player-props-nba',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-player-props',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"league":"NBA"}'::jsonb
  );
  $$
);

-- ─── Player props: NFL every 30 minutes ──────────────────────────────────────
SELECT cron.schedule(
  'fetch-player-props-nfl',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-player-props',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"league":"NFL"}'::jsonb
  );
  $$
);

-- ─── Player props: MLB every 30 minutes ──────────────────────────────────────
SELECT cron.schedule(
  'fetch-player-props-mlb',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-player-props',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"league":"MLB"}'::jsonb
  );
  $$
);

-- ─── Player props: NHL every 30 minutes ──────────────────────────────────────
SELECT cron.schedule(
  'fetch-player-props-nhl',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-player-props',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"league":"NHL"}'::jsonb
  );
  $$
);

-- ─── Live odds: every 5 minutes during game hours (all day — let function gate) ──
SELECT cron.schedule(
  'fetch-live-odds-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-live-odds',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─── Live scores: every 2 minutes ────────────────────────────────────────────
SELECT cron.schedule(
  'fetch-live-scores-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-scoreboard',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─── Live player props: every 3 minutes ──────────────────────────────────────
SELECT cron.schedule(
  'fetch-live-props-every-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/fetch-live-props',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ─── Auto-settle completed bets: every hour ──────────────────────────────────
-- Marks bets won/lost based on final game scores.
SELECT cron.schedule(
  'settle-completed-bets-hourly',
  '0 * * * *',
  $$
  UPDATE public.bets b
  SET
    status = CASE
      -- ── Moneyline ──────────────────────────────────────────────────────────
      WHEN b.market_type IN ('moneyline','h2h') AND b.side = 'home'
           AND g.home_score > g.away_score                             THEN 'won'
      WHEN b.market_type IN ('moneyline','h2h') AND b.side = 'away'
           AND g.away_score > g.home_score                             THEN 'won'
      WHEN b.market_type IN ('moneyline','h2h')
           AND g.home_score = g.away_score                             THEN 'push'

      -- ── Spread: home team + handicap ───────────────────────────────────────
      -- b.line is the handicap applied to the home team (e.g. -5.5 means home -5.5)
      -- Bet wins if (home_score + b.line) > away_score
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'home'
           AND (g.home_score::numeric + b.line) > g.away_score::numeric THEN 'won'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'home'
           AND (g.home_score::numeric + b.line) = g.away_score::numeric THEN 'push'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'away'
           AND (g.away_score::numeric - b.line) > g.home_score::numeric THEN 'won'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'away'
           AND (g.away_score::numeric - b.line) = g.home_score::numeric THEN 'push'

      -- ── Totals ─────────────────────────────────────────────────────────────
      WHEN b.market_type IN ('total','totals') AND b.side = 'over'
           AND (g.home_score + g.away_score)::numeric > b.line         THEN 'won'
      WHEN b.market_type IN ('total','totals') AND b.side = 'under'
           AND (g.home_score + g.away_score)::numeric < b.line         THEN 'won'
      WHEN b.market_type IN ('total','totals')
           AND (g.home_score + g.away_score)::numeric = b.line         THEN 'push'

      ELSE 'lost'
    END,
    result = CASE
      WHEN b.market_type IN ('moneyline','h2h') AND b.side = 'home'
           AND g.home_score > g.away_score                             THEN 'win'
      WHEN b.market_type IN ('moneyline','h2h') AND b.side = 'away'
           AND g.away_score > g.home_score                             THEN 'win'
      WHEN b.market_type IN ('moneyline','h2h')
           AND g.home_score = g.away_score                             THEN 'push'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'home'
           AND (g.home_score::numeric + b.line) > g.away_score::numeric THEN 'win'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'home'
           AND (g.home_score::numeric + b.line) = g.away_score::numeric THEN 'push'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'away'
           AND (g.away_score::numeric - b.line) > g.home_score::numeric THEN 'win'
      WHEN b.market_type IN ('spread','spreads') AND b.side = 'away'
           AND (g.away_score::numeric - b.line) = g.home_score::numeric THEN 'push'
      WHEN b.market_type IN ('total','totals') AND b.side = 'over'
           AND (g.home_score + g.away_score)::numeric > b.line         THEN 'win'
      WHEN b.market_type IN ('total','totals') AND b.side = 'under'
           AND (g.home_score + g.away_score)::numeric < b.line         THEN 'win'
      WHEN b.market_type IN ('total','totals')
           AND (g.home_score + g.away_score)::numeric = b.line         THEN 'push'
      ELSE 'loss'
    END,
    settled_at = now(),
    payout = CASE
      -- Push: return stake
      WHEN (g.home_score = g.away_score AND b.market_type IN ('moneyline','h2h'))
        OR ((g.home_score::numeric + b.line) = g.away_score::numeric AND b.market_type IN ('spread','spreads') AND b.side = 'home')
        OR ((g.away_score::numeric - b.line) = g.home_score::numeric AND b.market_type IN ('spread','spreads') AND b.side = 'away')
        OR ((g.home_score + g.away_score)::numeric = b.line AND b.market_type IN ('total','totals'))
           THEN COALESCE(b.stake_amount, 0)
      -- American odds payout for wins
      WHEN b.odds > 0 THEN COALESCE(b.stake_amount, 0) * (b.odds::numeric / 100)
      WHEN b.odds < 0 THEN COALESCE(b.stake_amount, 0) * (100.0 / ABS(b.odds::numeric))
      ELSE 0
    END
  FROM public.games g
  WHERE b.game_id = g.id
    AND g.status IN ('final', 'complete', 'closed', 'F', 'STATUS_FINAL')
    AND b.status NOT IN ('settled', 'won', 'lost', 'push', 'void')
    AND b.line IS NOT NULL
    AND g.home_score IS NOT NULL
    AND g.away_score IS NOT NULL
    AND b.market_type IN ('moneyline', 'h2h', 'total', 'totals', 'spread', 'spreads');
  $$
);

-- ─── Grant cron permissions ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA cron TO postgres;
