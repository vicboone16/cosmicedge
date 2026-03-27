
-- 1) Table
CREATE TABLE IF NOT EXISTS public.prizepicks_props_raw (
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
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index on projection_id
CREATE UNIQUE INDEX IF NOT EXISTS prizepicks_props_raw_projection_id_uidx
  ON public.prizepicks_props_raw (projection_id);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_game_id_idx
  ON public.prizepicks_props_raw (game_id);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_league_market_idx
  ON public.prizepicks_props_raw (league, market_type);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_start_time_idx
  ON public.prizepicks_props_raw (start_time_utc);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_player_idx
  ON public.prizepicks_props_raw (player_name);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_team_idx
  ON public.prizepicks_props_raw (team);

CREATE INDEX IF NOT EXISTS prizepicks_props_raw_payload_date_idx
  ON public.prizepicks_props_raw (payload_date_local);

-- 2) Updated-at trigger
DROP TRIGGER IF EXISTS trg_prizepicks_props_raw_updated_at ON public.prizepicks_props_raw;

CREATE TRIGGER trg_prizepicks_props_raw_updated_at
BEFORE UPDATE ON public.prizepicks_props_raw
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 3) Upsert function
CREATE OR REPLACE FUNCTION public.ingest_prizepicks_props_raw(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.prizepicks_props_raw (
    source, league, market_type, projection_id, game_id, matchup,
    player_name, team, position, stat_type, line_score,
    start_time_utc, start_time_local, board_time,
    odds_type, is_promo,
    payload_date_local, payload_timezone, fetched_at_local,
    raw_payload
  )
  SELECT
    coalesce(rec->>'source', 'prizepicks'),
    rec->>'league',
    rec->>'market_type',
    rec->>'projection_id',
    nullif(rec->>'game_id', ''),
    rec->>'matchup',
    rec->>'player_name',
    rec->>'team',
    rec->>'position',
    rec->>'stat_type',
    CASE WHEN nullif(rec->>'line_score', '') IS NULL THEN NULL ELSE (rec->>'line_score')::numeric END,
    CASE WHEN nullif(rec->>'start_time_utc', '') IS NULL THEN NULL ELSE (rec->>'start_time_utc')::timestamptz END,
    CASE WHEN nullif(rec->>'start_time_local', '') IS NULL THEN NULL ELSE (rec->>'start_time_local')::timestamptz END,
    CASE WHEN nullif(rec->>'board_time', '') IS NULL THEN NULL ELSE (rec->>'board_time')::timestamptz END,
    rec->>'odds_type',
    coalesce((rec->>'is_promo')::boolean, false),
    CASE WHEN nullif(p_payload->>'date_local', '') IS NULL THEN NULL ELSE (p_payload->>'date_local')::date END,
    p_payload->>'timezone',
    CASE WHEN nullif(rec->>'fetched_at_local', '') IS NULL THEN NULL ELSE (rec->>'fetched_at_local')::timestamptz END,
    rec
  FROM jsonb_array_elements(coalesce(p_payload->'records', '[]'::jsonb)) AS rec
  WHERE coalesce(rec->>'projection_id', '') <> ''
  ON CONFLICT (projection_id)
  DO UPDATE SET
    source = excluded.source,
    league = excluded.league,
    market_type = excluded.market_type,
    game_id = excluded.game_id,
    matchup = excluded.matchup,
    player_name = excluded.player_name,
    team = excluded.team,
    position = excluded.position,
    stat_type = excluded.stat_type,
    line_score = excluded.line_score,
    start_time_utc = excluded.start_time_utc,
    start_time_local = excluded.start_time_local,
    board_time = excluded.board_time,
    odds_type = excluded.odds_type,
    is_promo = excluded.is_promo,
    payload_date_local = excluded.payload_date_local,
    payload_timezone = excluded.payload_timezone,
    fetched_at_local = excluded.fetched_at_local,
    raw_payload = excluded.raw_payload,
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4) RLS - public read, service-role write
ALTER TABLE public.prizepicks_props_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on prizepicks_props_raw"
  ON public.prizepicks_props_raw FOR SELECT
  USING (true);

-- 5) Views
CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_today AS
SELECT
  projection_id, game_id, matchup, player_name, team, position,
  stat_type, line_score, start_time_local, start_time_utc,
  board_time, fetched_at_local
FROM public.prizepicks_props_raw
WHERE league = 'NBA'
  AND market_type = 'PRA'
  AND coalesce(is_promo, false) = false
  AND payload_date_local = current_date;

CREATE OR REPLACE VIEW public.v_prizepicks_nba_pra_today_grouped AS
SELECT
  coalesce(game_id, matchup) AS game_key,
  matchup,
  min(start_time_local) AS start_time_local,
  count(*) AS prop_count,
  jsonb_agg(
    jsonb_build_object(
      'projection_id', projection_id,
      'player_name', player_name,
      'team', team,
      'position', position,
      'stat_type', stat_type,
      'line_score', line_score,
      'is_promo', is_promo,
      'board_time', board_time
    )
    ORDER BY team, player_name
  ) AS props
FROM public.prizepicks_props_raw
WHERE league = 'NBA'
  AND market_type = 'PRA'
  AND payload_date_local = current_date
GROUP BY coalesce(game_id, matchup), matchup;
