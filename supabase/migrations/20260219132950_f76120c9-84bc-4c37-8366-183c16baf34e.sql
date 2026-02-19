
-- Fix merge_players to handle duplicate season stats conflicts gracefully
CREATE OR REPLACE FUNCTION public.merge_players(source_id uuid, target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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

  -- For player_game_stats: delete source rows that would conflict with target
  DELETE FROM player_game_stats src
  WHERE src.player_id = source_id
    AND EXISTS (
      SELECT 1 FROM player_game_stats tgt
      WHERE tgt.player_id = target_id
        AND tgt.game_id = src.game_id
        AND tgt.period = src.period
    );
  UPDATE player_game_stats SET player_id = target_id WHERE player_id = source_id;

  -- Reassign remaining foreign keys
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

  -- Delete the source player
  DELETE FROM players WHERE id = source_id;
END;
$function$
