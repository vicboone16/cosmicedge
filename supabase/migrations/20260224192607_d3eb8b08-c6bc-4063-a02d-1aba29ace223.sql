
-- Recreate the helper (first migration partially failed)
CREATE OR REPLACE FUNCTION public.np_prop_stat_value(
  p_prop_type text,
  p_points int, p_rebounds int, p_assists int,
  p_steals int, p_blocks int, p_three_made int,
  p_turnovers int, p_fg_attempted int
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_prop_type
    WHEN 'points'      THEN p_points
    WHEN 'rebounds'     THEN p_rebounds
    WHEN 'assists'      THEN p_assists
    WHEN 'steals'       THEN p_steals
    WHEN 'blocks'       THEN p_blocks
    WHEN 'threes'       THEN p_three_made
    WHEN 'turnovers'    THEN p_turnovers
    WHEN 'pts_reb_ast'  THEN p_points + p_rebounds + p_assists
    WHEN 'pts_reb'      THEN p_points + p_rebounds
    WHEN 'pts_ast'      THEN p_points + p_assists
    WHEN 'reb_ast'      THEN p_rebounds + p_assists
    ELSE NULL
  END::numeric;
$$;
