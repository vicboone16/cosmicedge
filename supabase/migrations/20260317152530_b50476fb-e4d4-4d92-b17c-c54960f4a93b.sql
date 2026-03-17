
-- Drop old function with wrong return type
DROP FUNCTION IF EXISTS public.compute_live_readiness(uuid);

-- Recreate with jsonb return
CREATE OR REPLACE FUNCTION public.compute_live_readiness(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game record;
  v_game_status_synced boolean := false;
  v_provider_mapped boolean := false;
  v_roster_ready boolean := false;
  v_lineups_ready boolean := false;
  v_live_boxscore_ready boolean := false;
  v_player_live_stats boolean := false;
  v_odds_ready boolean := false;
  v_market_defs boolean := true;
  v_active_model boolean := false;
  v_scorecard_ready boolean := true;
  v_props_generated boolean := false;
  v_failure_stage text := null;
  v_failure_detail text := null;
  v_cnt int;
  v_home_lineup int;
  v_away_lineup int;
BEGIN
  SELECT id, status, external_id, home_abbr, away_abbr, league
  INTO v_game FROM games WHERE id = p_game_id;

  IF v_game IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Game not found');
  END IF;

  v_game_status_synced := v_game.status IS NOT NULL;
  v_provider_mapped := v_game.external_id IS NOT NULL;

  SELECT count(*) INTO v_cnt FROM player_game_stats
  WHERE game_id = p_game_id AND period = 'full' AND team_abbr = v_game.home_abbr;
  IF v_cnt >= 5 THEN
    SELECT count(*) INTO v_cnt FROM player_game_stats
    WHERE game_id = p_game_id AND period = 'full' AND team_abbr = v_game.away_abbr;
    v_roster_ready := v_cnt >= 5;
  END IF;

  SELECT count(*) INTO v_home_lineup FROM depth_charts
  WHERE team_abbr = v_game.home_abbr AND league = COALESCE(v_game.league, 'NBA');
  SELECT count(*) INTO v_away_lineup FROM depth_charts
  WHERE team_abbr = v_game.away_abbr AND league = COALESCE(v_game.league, 'NBA');
  v_lineups_ready := v_home_lineup >= 5 AND v_away_lineup >= 5;

  SELECT count(*) INTO v_cnt FROM game_state_snapshots WHERE game_id = p_game_id LIMIT 1;
  v_live_boxscore_ready := v_cnt > 0;
  v_player_live_stats := v_roster_ready;

  SELECT count(*) INTO v_cnt FROM odds_snapshots WHERE game_id = p_game_id LIMIT 1;
  v_odds_ready := v_cnt > 0;

  SELECT count(*) INTO v_cnt FROM model_activation_state
  WHERE scope_type = 'global' AND scope_key = 'default' AND runtime_status = 'confirmed';
  v_active_model := v_cnt > 0;

  SELECT count(*) INTO v_cnt FROM nba_player_props_live WHERE game_id = p_game_id LIMIT 1;
  v_props_generated := v_cnt > 0;

  IF NOT v_game_status_synced THEN
    v_failure_stage := 'game_status_synced';
    v_failure_detail := 'Game status NULL for ' || v_game.home_abbr || ' vs ' || v_game.away_abbr;
  ELSIF NOT v_provider_mapped THEN
    v_failure_stage := 'provider_game_mapped';
    v_failure_detail := 'No external_id for ' || v_game.home_abbr || ' vs ' || v_game.away_abbr;
  ELSIF NOT v_roster_ready THEN
    v_failure_stage := 'roster_ready';
    v_failure_detail := 'Insufficient roster data for ' || v_game.home_abbr || ' vs ' || v_game.away_abbr;
  ELSIF NOT v_lineups_ready THEN
    v_failure_stage := 'lineups_ready';
    v_failure_detail := 'Depth chart: ' || v_home_lineup || ' home, ' || v_away_lineup || ' away entries';
  ELSIF NOT v_odds_ready THEN
    v_failure_stage := 'odds_ready';
    v_failure_detail := 'No odds snapshots for ' || v_game.home_abbr || ' vs ' || v_game.away_abbr;
  ELSIF NOT v_active_model THEN
    v_failure_stage := 'active_model_ready';
    v_failure_detail := 'No runtime-confirmed model activation';
  ELSIF NOT v_props_generated THEN
    v_failure_stage := 'live_prop_rows_generated';
    v_failure_detail := 'No live prop rows for ' || v_game.home_abbr || ' vs ' || v_game.away_abbr;
  END IF;

  INSERT INTO live_prop_readiness (
    game_id, game_status_synced, provider_game_mapped, roster_ready, lineups_ready,
    live_boxscore_ready, player_live_stats_ready, odds_ready, market_definitions_ready,
    active_model_ready, scorecard_ready, live_prop_rows_generated,
    failure_stage, failure_detail, checked_at, updated_at
  ) VALUES (
    p_game_id, v_game_status_synced, v_provider_mapped, v_roster_ready, v_lineups_ready,
    v_live_boxscore_ready, v_player_live_stats, v_odds_ready, v_market_defs,
    v_active_model, v_scorecard_ready, v_props_generated,
    v_failure_stage, v_failure_detail, now(), now()
  )
  ON CONFLICT (game_id) DO UPDATE SET
    game_status_synced = EXCLUDED.game_status_synced,
    provider_game_mapped = EXCLUDED.provider_game_mapped,
    roster_ready = EXCLUDED.roster_ready,
    lineups_ready = EXCLUDED.lineups_ready,
    live_boxscore_ready = EXCLUDED.live_boxscore_ready,
    player_live_stats_ready = EXCLUDED.player_live_stats_ready,
    odds_ready = EXCLUDED.odds_ready,
    market_definitions_ready = EXCLUDED.market_definitions_ready,
    active_model_ready = EXCLUDED.active_model_ready,
    scorecard_ready = EXCLUDED.scorecard_ready,
    live_prop_rows_generated = EXCLUDED.live_prop_rows_generated,
    failure_stage = EXCLUDED.failure_stage,
    failure_detail = EXCLUDED.failure_detail,
    checked_at = EXCLUDED.checked_at,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'ok', true,
    'failure_stage', v_failure_stage,
    'failure_detail', v_failure_detail,
    'all_ready', v_failure_stage IS NULL
  );
END;
$$;

-- Drop old check_schema_parity if return type differs
DROP FUNCTION IF EXISTS public.check_schema_parity();

CREATE OR REPLACE FUNCTION public.check_schema_parity()
RETURNS TABLE(object_type text, object_name text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 'table'::text, c.relname::text, 'RLS is disabled'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND c.relname NOT IN ('schema_migrations', 'spatial_ref_sys')
  ORDER BY c.relname;

  RETURN QUERY
  SELECT 'sequence'::text, c.relname::text, 'Sequence name contains digit suffix — possible drift'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
    AND c.relname ~ '[0-9]$'
    AND c.relname NOT LIKE '%_id_seq'
  ORDER BY c.relname;
END;
$$;
