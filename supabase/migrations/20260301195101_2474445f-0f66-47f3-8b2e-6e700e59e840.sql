-- Fix 1: Add admin authorization to SECURITY DEFINER functions

-- safe_delete_player: add admin check
CREATE OR REPLACE FUNCTION public.safe_delete_player(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  -- Authorization: admin only
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT name INTO v_name FROM public.players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not found');
  END IF;
  DELETE FROM public.players WHERE id = p_player_id;
  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END;
$$;

-- safe_delete_game: add admin check
CREATE OR REPLACE FUNCTION public.safe_delete_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  -- Authorization: admin only
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT home_team || ' vs ' || away_team INTO v_label
  FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Game not found');
  END IF;
  DELETE FROM public.games WHERE id = p_game_id;
  RETURN jsonb_build_object('ok', true, 'deleted', v_label);
END;
$$;

-- merge_players: add admin check
CREATE OR REPLACE FUNCTION public.merge_players(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: admin only
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- For player_season_stats: delete source rows that would conflict with target,
  -- then move remaining source rows to target
  DELETE FROM player_season_stats src
  WHERE src.player_id = source_id
    AND EXISTS (
      SELECT 1 FROM player_season_stats tgt
      WHERE tgt.player_id = target_id
        AND tgt.season = src.season
        AND tgt.league = src.league
        AND tgt.stat_type = src.stat_type
        AND tgt.period = src.period
    );
  UPDATE player_season_stats SET player_id = target_id WHERE player_id = source_id;

  DELETE FROM player_game_stats src
  WHERE src.player_id = source_id
    AND EXISTS (
      SELECT 1 FROM player_game_stats tgt
      WHERE tgt.player_id = target_id
        AND tgt.game_id = src.game_id
        AND tgt.period = src.period
    );
  UPDATE player_game_stats SET player_id = target_id WHERE player_id = source_id;

  UPDATE player_projections SET player_id = target_id WHERE player_id = source_id;
  UPDATE player_news SET player_id = target_id WHERE player_id = source_id;
  UPDATE player_props SET player_name = (SELECT name FROM players WHERE id = target_id) WHERE player_name = (SELECT name FROM players WHERE id = source_id);
  UPDATE play_by_play SET player_id = target_id WHERE player_id = source_id;
  UPDATE play_by_play SET assist_player_id = target_id WHERE assist_player_id = source_id;
  UPDATE injuries SET player_id = target_id WHERE player_id = source_id;
  UPDATE depth_charts SET player_id = target_id WHERE player_id = source_id;
  UPDATE bets SET player_id = target_id WHERE player_id = source_id;
  UPDATE intel_notes SET player_id = target_id WHERE player_id = source_id;
  UPDATE astro_calculations SET entity_id = target_id WHERE entity_id = source_id AND entity_type = 'player';

  DELETE FROM players WHERE id = source_id;
END;
$$;
