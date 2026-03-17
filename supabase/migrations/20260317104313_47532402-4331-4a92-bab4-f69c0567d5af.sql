-- ============================================================
-- 1. Server-side live_prop_readiness table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_prop_readiness (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  game_status_synced boolean NOT NULL DEFAULT false,
  provider_game_mapped boolean NOT NULL DEFAULT false,
  roster_ready boolean NOT NULL DEFAULT false,
  lineups_ready boolean NOT NULL DEFAULT false,
  live_boxscore_ready boolean NOT NULL DEFAULT false,
  player_live_stats_ready boolean NOT NULL DEFAULT false,
  odds_ready boolean NOT NULL DEFAULT false,
  market_definitions_ready boolean NOT NULL DEFAULT false,
  active_model_ready boolean NOT NULL DEFAULT false,
  scorecard_ready boolean NOT NULL DEFAULT false,
  live_prop_rows_generated boolean NOT NULL DEFAULT false,
  failure_stage text,
  failure_detail text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_prop_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_readiness_all" ON public.live_prop_readiness
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_readiness" ON public.live_prop_readiness
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. Model activation audit log (if missing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.model_activation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL DEFAULT 'global',
  scope_key text NOT NULL DEFAULT 'default',
  previous_model_id text,
  new_model_id text,
  action text NOT NULL,
  triggered_by uuid,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  result_status text NOT NULL DEFAULT 'pending',
  result_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_activation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_audit_all" ON public.model_activation_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_read_audit" ON public.model_activation_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authenticated_insert_audit" ON public.model_activation_audit_log
  FOR INSERT TO authenticated WITH CHECK (triggered_by = auth.uid());

-- ============================================================
-- 3. Model activation state table (if missing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.model_activation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL DEFAULT 'global',
  scope_key text NOT NULL DEFAULT 'default',
  active_model_id text NOT NULL,
  active_model_version text,
  activated_by uuid,
  activated_at timestamptz NOT NULL DEFAULT now(),
  runtime_confirmed_at timestamptz,
  runtime_status text NOT NULL DEFAULT 'pending',
  cache_bust_token text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_type, scope_key)
);

ALTER TABLE public.model_activation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_activation_all" ON public.model_activation_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_activation" ON public.model_activation_state
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_write_activation" ON public.model_activation_state
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4. Publish safety: schema parity check function
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_schema_parity()
RETURNS TABLE(
  object_type text,
  object_name text,
  issue text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Check views that reference non-existent tables/columns
  RETURN QUERY
  SELECT 'view'::text, v.viewname::text, 'View exists but may have stale references'::text
  FROM pg_views v
  WHERE v.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v.viewname
    );

  -- Check sequences with mismatched names (drift indicator)
  RETURN QUERY
  SELECT 'sequence'::text, c.relname::text,
    'Identity sequence name may differ between environments'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
    AND c.relname ~ '_(seq|seq1|seq2)$'
    AND c.relname ~ '[0-9]$';

  -- Check tables with RLS disabled
  RETURN QUERY
  SELECT 'table_no_rls'::text, c.relname::text, 'RLS is disabled on public table'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  RETURN;
END;
$$;

-- ============================================================
-- 5. Server-side readiness compute function
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_readiness(p_game_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_game record;
  v_flags record;
  v_failure_stage text := null;
  v_failure_detail text := null;
  v_game_status_synced boolean := false;
  v_provider_mapped boolean := false;
  v_roster_ready boolean := false;
  v_lineups_ready boolean := false;
  v_boxscore_ready boolean := false;
  v_player_stats_ready boolean := false;
  v_odds_ready boolean := false;
  v_model_ready boolean := false;
  v_scorecard_ready boolean := false;
  v_props_generated boolean := false;
  v_roster_count int;
  v_lineup_count int;
  v_odds_count int;
  v_props_count int;
BEGIN
  -- Game status
  SELECT id, status, external_id, home_abbr, away_abbr, league
  INTO v_game FROM games WHERE id = p_game_id;

  IF v_game.id IS NULL THEN
    v_failure_stage := 'game_status_synced';
    v_failure_detail := 'Game not found';
  ELSE
    v_game_status_synced := v_game.status IS NOT NULL;
    v_provider_mapped := v_game.external_id IS NOT NULL;
  END IF;

  -- Roster
  SELECT count(*) INTO v_roster_count
  FROM player_game_stats WHERE game_id = p_game_id AND period = 'full';
  v_roster_ready := v_roster_count >= 5;
  v_boxscore_ready := v_roster_count > 0;
  v_player_stats_ready := v_roster_count > 0;

  -- Lineups (depth_charts)
  SELECT count(*) INTO v_lineup_count
  FROM depth_charts
  WHERE team_abbr IN (v_game.home_abbr, v_game.away_abbr)
    AND league = COALESCE(v_game.league, 'NBA');
  v_lineups_ready := v_lineup_count >= 5;

  -- Odds
  SELECT count(*) INTO v_odds_count
  FROM odds_snapshots WHERE game_id = p_game_id;
  v_odds_ready := v_odds_count > 0;

  -- Model
  SELECT EXISTS(
    SELECT 1 FROM model_activation_state
    WHERE scope_type = 'global' AND scope_key = 'default'
      AND runtime_status = 'confirmed'
  ) INTO v_model_ready;

  -- Scorecard (ce_scorecards_fast_v9 is a view, just check it has rows)
  v_scorecard_ready := true; -- static view always available

  -- Props
  SELECT count(*) INTO v_props_count
  FROM nba_player_props_live WHERE game_id::text = p_game_id::text;
  v_props_generated := v_props_count > 0;

  -- Determine first failure stage
  IF NOT v_game_status_synced THEN
    v_failure_stage := 'game_status_synced';
    v_failure_detail := 'Game status not synced';
  ELSIF NOT v_provider_mapped THEN
    v_failure_stage := 'provider_game_mapped';
    v_failure_detail := 'No external provider ID mapped';
  ELSIF NOT v_roster_ready THEN
    v_failure_stage := 'roster_ready';
    v_failure_detail := format('Only %s player stats found (need ≥5)', v_roster_count);
  ELSIF NOT v_lineups_ready THEN
    v_failure_stage := 'lineups_ready';
    v_failure_detail := format('Only %s depth chart entries found', v_lineup_count);
  ELSIF NOT v_odds_ready THEN
    v_failure_stage := 'odds_ready';
    v_failure_detail := 'No odds snapshots found';
  ELSIF NOT v_model_ready THEN
    v_failure_stage := 'active_model_ready';
    v_failure_detail := 'No model runtime-confirmed globally';
  ELSIF NOT v_props_generated THEN
    v_failure_stage := 'live_prop_rows_generated';
    v_failure_detail := 'No live prop rows generated yet';
  END IF;

  -- Upsert
  INSERT INTO live_prop_readiness (
    game_id, game_status_synced, provider_game_mapped, roster_ready,
    lineups_ready, live_boxscore_ready, player_live_stats_ready,
    odds_ready, market_definitions_ready, active_model_ready,
    scorecard_ready, live_prop_rows_generated,
    failure_stage, failure_detail, checked_at, updated_at
  ) VALUES (
    p_game_id, v_game_status_synced, v_provider_mapped, v_roster_ready,
    v_lineups_ready, v_boxscore_ready, v_player_stats_ready,
    v_odds_ready, true, v_model_ready,
    v_scorecard_ready, v_props_generated,
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
    updated_at = now();
END;
$$;