-- Allow admins to manage players
CREATE POLICY "Admins can insert players"
ON public.players FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update players"
ON public.players FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete players"
ON public.players FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a merge function that reassigns all FK references from source to target, then deletes source
CREATE OR REPLACE FUNCTION public.merge_players(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reassign foreign keys in all referencing tables
  UPDATE player_game_stats SET player_id = target_id WHERE player_id = source_id;
  UPDATE player_season_stats SET player_id = target_id WHERE player_id = source_id;
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
$$;