
-- ============================================================
-- CASCADE DELETE TRIGGERS — players & games
-- ============================================================
-- These triggers fire BEFORE DELETE in a single transaction,
-- guaranteeing all related data is cleaned up atomically with
-- no orphans, regardless of which code path triggers the delete.
-- ============================================================

-- ── 1. PLAYER CASCADE ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_delete_player()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hard-delete rows that are only meaningful WITH the player
  DELETE FROM public.player_game_stats      WHERE player_id = OLD.id;
  DELETE FROM public.player_season_stats    WHERE player_id = OLD.id;
  DELETE FROM public.player_projections     WHERE player_id = OLD.id;
  DELETE FROM public.astro_calculations
    WHERE entity_id::text = OLD.id::text AND entity_type = 'player';

  -- Soft-nullify FK cols where the parent row (bet, note, etc.) must survive
  UPDATE public.bets         SET player_id = NULL WHERE player_id = OLD.id;
  UPDATE public.intel_notes  SET player_id = NULL WHERE player_id = OLD.id;
  UPDATE public.injuries     SET player_id = NULL WHERE player_id = OLD.id;
  UPDATE public.depth_charts SET player_id = NULL WHERE player_id = OLD.id;
  UPDATE public.player_news  SET player_id = NULL WHERE player_id = OLD.id;

  -- Nullify both FK columns in play_by_play
  UPDATE public.play_by_play
    SET player_id = NULL
    WHERE player_id = OLD.id;
  UPDATE public.play_by_play
    SET assist_player_id = NULL
    WHERE assist_player_id = OLD.id;

  -- NBA PBP events: text column, clear player name references
  UPDATE public.nba_play_by_play_events
    SET player = NULL
    WHERE player = OLD.name;

  -- Audit log: record the deletion event
  INSERT INTO public.audit_log (action, entity_type, entity_id, before_data, meta)
  VALUES (
    'DELETE_PLAYER',
    'player',
    OLD.id::text,
    jsonb_build_object(
      'name', OLD.name,
      'team', OLD.team,
      'league', OLD.league,
      'position', OLD.position
    ),
    jsonb_build_object('trigger', 'cascade_delete_player', 'timestamp', now())
  );

  RETURN OLD;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS trg_cascade_delete_player ON public.players;

CREATE TRIGGER trg_cascade_delete_player
  BEFORE DELETE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_player();


-- ── 2. GAME CASCADE ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_delete_game()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext_id text;
BEGIN
  -- Stash external_id for NBA PBP lookup before any deletes
  v_ext_id := OLD.external_id;

  -- Hard-delete all game-scoped data
  DELETE FROM public.game_quarters          WHERE game_id = OLD.id;
  DELETE FROM public.game_state_snapshots   WHERE game_id = OLD.id;
  DELETE FROM public.game_referees          WHERE game_id = OLD.id;
  DELETE FROM public.odds_snapshots         WHERE game_id = OLD.id;
  DELETE FROM public.historical_odds        WHERE game_id = OLD.id;
  DELETE FROM public.play_by_play           WHERE game_id = OLD.id;
  DELETE FROM public.player_game_stats      WHERE game_id = OLD.id;
  DELETE FROM public.alerts                 WHERE game_id = OLD.id;
  DELETE FROM public.intel_notes            WHERE game_id = OLD.id;

  -- bets: game_id is NOT NULL so delete bets tied to this game too
  DELETE FROM public.bets                   WHERE game_id = OLD.id;

  -- astro calculations keyed by game entity
  DELETE FROM public.astro_calculations
    WHERE entity_id::text = OLD.id::text AND entity_type = 'game';

  -- NBA play-by-play events (keyed by external string id)
  IF v_ext_id IS NOT NULL THEN
    DELETE FROM public.nba_play_by_play_events WHERE game_id = v_ext_id;
    -- Some imports store with leading zeros
    DELETE FROM public.nba_play_by_play_events WHERE game_id = '00' || v_ext_id;
  END IF;

  -- NFL PBP (also keyed by string external id)
  IF v_ext_id IS NOT NULL THEN
    DELETE FROM public.nfl_play_by_play        WHERE game_id = v_ext_id;
    DELETE FROM public.nfl_play_by_play_players WHERE game_id = v_ext_id;
    DELETE FROM public.nfl_player_game_stats    WHERE game_id = v_ext_id;
  END IF;

  -- live_board_items depend on bets which are now gone — nulls cascade naturally
  -- (live_board_items FK to bets already handled by above bets DELETE)

  -- Audit log
  INSERT INTO public.audit_log (action, entity_type, entity_id, before_data, meta)
  VALUES (
    'DELETE_GAME',
    'game',
    OLD.id::text,
    jsonb_build_object(
      'league',      OLD.league,
      'home_team',   OLD.home_team,
      'away_team',   OLD.away_team,
      'start_time',  OLD.start_time,
      'status',      OLD.status,
      'external_id', OLD.external_id
    ),
    jsonb_build_object('trigger', 'cascade_delete_game', 'timestamp', now())
  );

  RETURN OLD;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS trg_cascade_delete_game ON public.games;

CREATE TRIGGER trg_cascade_delete_game
  BEFORE DELETE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_game();


-- ── 3. Safe wrapper RPCs (called from admin UI) ───────────
-- These let admin code do a single RPC call instead of
-- a waterfall of client-side deletes.

CREATE OR REPLACE FUNCTION public.safe_delete_player(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not found');
  END IF;
  -- Trigger fires automatically on DELETE
  DELETE FROM public.players WHERE id = p_player_id;
  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_delete_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  SELECT home_team || ' vs ' || away_team INTO v_label
  FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Game not found');
  END IF;
  -- Trigger fires automatically on DELETE
  DELETE FROM public.games WHERE id = p_game_id;
  RETURN jsonb_build_object('ok', true, 'deleted', v_label);
END;
$$;

-- Grant execute to authenticated users (admin gate is in RLS + UI)
GRANT EXECUTE ON FUNCTION public.safe_delete_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_delete_game(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cascade_delete_player() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cascade_delete_game() TO authenticated;
