
-- Add fetched_minute column to existing raw table
ALTER TABLE public.prizepicks_props_raw ADD COLUMN IF NOT EXISTS fetched_minute timestamptz NULL;

-- Drop old unique index on projection_id only
DROP INDEX IF EXISTS public.prizepicks_props_raw_projection_id_uidx;

-- Create new tables
CREATE TABLE IF NOT EXISTS public.prizepicks_props_current (
  id bigserial PRIMARY KEY,
  source text NOT NULL DEFAULT 'prizepicks',
  league text NOT NULL,
  market_type text NOT NULL,
  projection_id text NOT NULL,
  game_id text NULL,
  matchup text NULL,
  player_name text NOT NULL,
  team text NULL,
  position text NULL,
  stat_type text NOT NULL,
  line_score numeric NULL,
  start_time_utc timestamptz NULL,
  start_time_local timestamptz NULL,
  board_time timestamptz NULL,
  odds_type text NULL,
  is_promo boolean NOT NULL DEFAULT false,
  payload_date_local date NULL,
  payload_timezone text NULL,
  fetched_at_local timestamptz NULL,
  fetched_minute timestamptz NULL,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prizepicks_ingestion_log (
  id bigserial PRIMARY KEY,
  source text NOT NULL DEFAULT 'prizepicks',
  feed_name text NULL,
  payload_date_local date NULL,
  payload_timezone text NULL,
  received_record_count integer NOT NULL DEFAULT 0,
  inserted_raw_count integer NOT NULL DEFAULT 0,
  upserted_current_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_text text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_feed_health (
  feed_name text PRIMARY KEY,
  last_success_at timestamptz NULL,
  last_record_count integer NULL,
  last_error_text text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS prizepicks_props_raw_projection_id_fetched_minute_uidx
  ON public.prizepicks_props_raw (projection_id, fetched_minute);

CREATE UNIQUE INDEX IF NOT EXISTS prizepicks_props_current_projection_id_uidx
  ON public.prizepicks_props_current (projection_id);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_fetched_minute_idx ON public.prizepicks_props_raw (fetched_minute DESC);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_game_id_idx ON public.prizepicks_props_current (game_id);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_league_market_idx ON public.prizepicks_props_current (league, market_type);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_payload_date_idx ON public.prizepicks_props_current (payload_date_local);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_start_time_idx ON public.prizepicks_props_current (start_time_utc);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_player_idx ON public.prizepicks_props_current (player_name);
CREATE INDEX IF NOT EXISTS prizepicks_props_current_team_idx ON public.prizepicks_props_current (team);

-- Triggers
DROP TRIGGER IF EXISTS trg_prizepicks_props_current_updated_at ON public.prizepicks_props_current;
CREATE TRIGGER trg_prizepicks_props_current_updated_at
  BEFORE UPDATE ON public.prizepicks_props_current
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.prizepicks_props_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizepicks_ingestion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on prizepicks_props_raw" ON public.prizepicks_props_raw;
DROP POLICY IF EXISTS prizepicks_props_current_read_authenticated ON public.prizepicks_props_current;
DROP POLICY IF EXISTS prizepicks_props_raw_no_public_read ON public.prizepicks_props_raw;
DROP POLICY IF EXISTS prizepicks_ingestion_log_no_public_read ON public.prizepicks_ingestion_log;

CREATE POLICY prizepicks_props_current_read_authenticated
  ON public.prizepicks_props_current FOR SELECT TO authenticated USING (true);

CREATE POLICY prizepicks_props_raw_no_public_read
  ON public.prizepicks_props_raw FOR SELECT TO authenticated USING (false);

CREATE POLICY prizepicks_ingestion_log_no_public_read
  ON public.prizepicks_ingestion_log FOR SELECT TO authenticated USING (false);

-- Drop old v1 objects
DROP VIEW IF EXISTS public.v_prizepicks_nba_pra_today_grouped CASCADE;
DROP VIEW IF EXISTS public.v_prizepicks_nba_pra_today CASCADE;
DROP FUNCTION IF EXISTS public.ingest_prizepicks_props_raw(jsonb) CASCADE;

-- Main ingest RPC
CREATE OR REPLACE FUNCTION public.ingest_prizepicks_props_bundle(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received_count integer := 0;
  v_inserted_raw_count integer := 0;
  v_upserted_current_count integer := 0;
  v_feed_name text := nullif(p_payload->>'feed', '');
  v_payload_date_local date := nullif(p_payload->>'date_local', '')::date;
  v_payload_timezone text := nullif(p_payload->>'timezone', '');
  v_log_id bigint;
BEGIN
  v_received_count := coalesce(jsonb_array_length(coalesce(p_payload->'records', '[]'::jsonb)), 0);

  WITH normalized AS (
    SELECT
      rec,
      coalesce(rec->>'source', 'prizepicks') AS source,
      nullif(rec->>'league', '') AS league,
      nullif(rec->>'market_type', '') AS market_type,
      nullif(rec->>'projection_id', '') AS projection_id,
      nullif(rec->>'game_id', '') AS game_id,
      nullif(rec->>'matchup', '') AS matchup,
      nullif(rec->>'player_name', '') AS player_name,
      nullif(rec->>'team', '') AS team,
      nullif(rec->>'position', '') AS position,
      nullif(rec->>'stat_type', '') AS stat_type,
      CASE WHEN nullif(rec->>'line_score', '') IS NULL THEN NULL ELSE (rec->>'line_score')::numeric END AS line_score,
      CASE WHEN nullif(rec->>'start_time_utc', '') IS NULL THEN NULL ELSE (rec->>'start_time_utc')::timestamptz END AS start_time_utc,
      CASE WHEN nullif(rec->>'start_time_local', '') IS NULL THEN NULL ELSE (rec->>'start_time_local')::timestamptz END AS start_time_local,
      CASE WHEN nullif(rec->>'board_time', '') IS NULL THEN NULL ELSE (rec->>'board_time')::timestamptz END AS board_time,
      nullif(rec->>'odds_type', '') AS odds_type,
      coalesce((rec->>'is_promo')::boolean, false) AS is_promo,
      CASE WHEN nullif(rec->>'fetched_at_local', '') IS NULL THEN now() ELSE (rec->>'fetched_at_local')::timestamptz END AS fetched_at_local
    FROM jsonb_array_elements(coalesce(p_payload->'records', '[]'::jsonb)) rec
  ),
  valid_rows AS (
    SELECT *, date_trunc('minute', fetched_at_local) AS fetched_minute
    FROM normalized
    WHERE projection_id IS NOT NULL AND league IS NOT NULL AND market_type IS NOT NULL AND player_name IS NOT NULL AND stat_type IS NOT NULL
  ),
  raw_insert AS (
    INSERT INTO public.prizepicks_props_raw (
      source, league, market_type, projection_id, game_id, matchup,
      player_name, team, position, stat_type, line_score,
      start_time_utc, start_time_local, board_time,
      odds_type, is_promo, payload_date_local, payload_timezone,
      fetched_at_local, fetched_minute, raw_payload
    )
    SELECT source, league, market_type, projection_id, game_id, matchup,
      player_name, team, position, stat_type, line_score,
      start_time_utc, start_time_local, board_time,
      odds_type, is_promo, v_payload_date_local, v_payload_timezone,
      fetched_at_local, fetched_minute, rec
    FROM valid_rows
    ON CONFLICT (projection_id, fetched_minute) DO UPDATE SET
      source=EXCLUDED.source, league=EXCLUDED.league, market_type=EXCLUDED.market_type,
      game_id=EXCLUDED.game_id, matchup=EXCLUDED.matchup, player_name=EXCLUDED.player_name,
      team=EXCLUDED.team, position=EXCLUDED.position, stat_type=EXCLUDED.stat_type,
      line_score=EXCLUDED.line_score, start_time_utc=EXCLUDED.start_time_utc,
      start_time_local=EXCLUDED.start_time_local, board_time=EXCLUDED.board_time,
      odds_type=EXCLUDED.odds_type, is_promo=EXCLUDED.is_promo,
      payload_date_local=EXCLUDED.payload_date_local, payload_timezone=EXCLUDED.payload_timezone,
      fetched_at_local=EXCLUDED.fetched_at_local, raw_payload=EXCLUDED.raw_payload, updated_at=now()
    RETURNING 1
  ),
  current_upsert AS (
    INSERT INTO public.prizepicks_props_current (
      source, league, market_type, projection_id, game_id, matchup,
      player_name, team, position, stat_type, line_score,
      start_time_utc, start_time_local, board_time,
      odds_type, is_promo, payload_date_local, payload_timezone,
      fetched_at_local, fetched_minute, raw_row
    )
    SELECT source, league, market_type, projection_id, game_id, matchup,
      player_name, team, position, stat_type, line_score,
      start_time_utc, start_time_local, board_time,
      odds_type, is_promo, v_payload_date_local, v_payload_timezone,
      fetched_at_local, fetched_minute, rec
    FROM valid_rows
    ON CONFLICT (projection_id) DO UPDATE SET
      source=EXCLUDED.source, league=EXCLUDED.league, market_type=EXCLUDED.market_type,
      game_id=EXCLUDED.game_id, matchup=EXCLUDED.matchup, player_name=EXCLUDED.player_name,
      team=EXCLUDED.team, position=EXCLUDED.position, stat_type=EXCLUDED.stat_type,
      line_score=EXCLUDED.line_score, start_time_utc=EXCLUDED.start_time_utc,
      start_time_local=EXCLUDED.start_time_local, board_time=EXCLUDED.board_time,
      odds_type=EXCLUDED.odds_type, is_promo=EXCLUDED.is_promo,
      payload_date_local=EXCLUDED.payload_date_local, payload_timezone=EXCLUDED.payload_timezone,
      fetched_at_local=EXCLUDED.fetched_at_local, fetched_minute=EXCLUDED.fetched_minute,
      raw_row=EXCLUDED.raw_row, updated_at=now()
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM raw_insert), (SELECT count(*) FROM current_upsert)
  INTO v_inserted_raw_count, v_upserted_current_count;

  INSERT INTO public.prizepicks_ingestion_log (
    source, feed_name, payload_date_local, payload_timezone,
    received_record_count, inserted_raw_count, upserted_current_count, status, payload
  ) VALUES (
    'prizepicks', v_feed_name, v_payload_date_local, v_payload_timezone,
    v_received_count, v_inserted_raw_count, v_upserted_current_count, 'ok', p_payload
  ) RETURNING id INTO v_log_id;

  INSERT INTO public.external_feed_health (feed_name, last_success_at, last_record_count, updated_at)
  VALUES (coalesce(v_feed_name, 'prizepicks_unknown'), now(), v_upserted_current_count, now())
  ON CONFLICT (feed_name) DO UPDATE SET
    last_success_at=now(), last_record_count=EXCLUDED.last_record_count, last_error_text=NULL, updated_at=now();

  RETURN jsonb_build_object(
    'ok', true, 'log_id', v_log_id, 'feed', v_feed_name,
    'received_record_count', v_received_count,
    'inserted_raw_count', v_inserted_raw_count,
    'upserted_current_count', v_upserted_current_count
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.prizepicks_ingestion_log (
    source, feed_name, payload_date_local, payload_timezone,
    received_record_count, inserted_raw_count, upserted_current_count,
    status, error_text, payload
  ) VALUES (
    'prizepicks', v_feed_name, v_payload_date_local, v_payload_timezone,
    v_received_count, v_inserted_raw_count, v_upserted_current_count,
    'error', SQLERRM, p_payload
  );

  INSERT INTO public.external_feed_health (feed_name, last_error_text, updated_at)
  VALUES (coalesce(v_feed_name, 'prizepicks_unknown'), SQLERRM, now())
  ON CONFLICT (feed_name) DO UPDATE SET last_error_text=EXCLUDED.last_error_text, updated_at=now();

  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'feed', v_feed_name);
END;
$$;

-- Views
CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_current WITH (security_invoker = true) AS
SELECT projection_id, game_id, matchup, player_name, team, position,
  stat_type, line_score, start_time_local, start_time_utc, board_time,
  is_promo, fetched_at_local, fetched_minute
FROM public.prizepicks_props_current
WHERE league = 'NBA' AND market_type = 'PRA';

CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_current_nonpromo WITH (security_invoker = true) AS
SELECT * FROM public.v_prizepicks_nba_pra_current
WHERE coalesce(is_promo, false) = false;

CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_grouped WITH (security_invoker = true) AS
SELECT
  coalesce(game_id, matchup) AS game_key, matchup,
  min(start_time_local) AS start_time_local, count(*) AS prop_count,
  jsonb_agg(jsonb_build_object(
    'projection_id', projection_id, 'player_name', player_name,
    'team', team, 'position', position, 'stat_type', stat_type,
    'line_score', line_score, 'is_promo', is_promo, 'fetched_at_local', fetched_at_local
  ) ORDER BY team, player_name) AS props
FROM public.prizepicks_props_current
WHERE league = 'NBA' AND market_type = 'PRA'
GROUP BY coalesce(game_id, matchup), matchup;

CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_today_la WITH (security_invoker = true) AS
SELECT projection_id, game_id, matchup, player_name, team, position,
  stat_type, line_score, start_time_local, start_time_utc, board_time,
  is_promo, fetched_at_local
FROM public.prizepicks_props_current
WHERE league = 'NBA' AND market_type = 'PRA'
  AND (start_time_utc AT TIME ZONE 'America/Los_Angeles')::date = (now() AT TIME ZONE 'America/Los_Angeles')::date;

CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_today_la_nonpromo WITH (security_invoker = true) AS
SELECT projection_id, game_id, matchup, player_name, team, position,
  stat_type, line_score, start_time_local, start_time_utc, board_time, fetched_at_local
FROM public.prizepicks_props_current
WHERE league = 'NBA' AND market_type = 'PRA'
  AND coalesce(is_promo, false) = false
  AND (start_time_utc AT TIME ZONE 'America/Los_Angeles')::date = (now() AT TIME ZONE 'America/Los_Angeles')::date;

CREATE OR REPLACE VIEW public.v_prizepicks_ingestion_recent WITH (security_invoker = true) AS
SELECT id, source, feed_name, payload_date_local, payload_timezone,
  received_record_count, inserted_raw_count, upserted_current_count,
  status, error_text, created_at
FROM public.prizepicks_ingestion_log
ORDER BY created_at DESC;

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_prizepicks_raw(p_keep_days integer DEFAULT 14)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted integer := 0;
BEGIN
  DELETE FROM public.prizepicks_props_raw WHERE created_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
