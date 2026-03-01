-- Non-destructive view update to preserve dependencies during publish
-- Keeps exact output columns/order/types: (game_id uuid, player_id uuid, prop_type text, stat_value numeric)
CREATE OR REPLACE VIEW public.np_player_prop_stat_long AS
SELECT
  pgs.game_id,
  pgs.player_id,
  'player_points'::text AS prop_type,
  pgs.points::numeric AS stat_value
FROM public.player_game_stats pgs
UNION ALL
SELECT
  pgs.game_id,
  pgs.player_id,
  'player_rebounds'::text AS prop_type,
  pgs.rebounds::numeric AS stat_value
FROM public.player_game_stats pgs
UNION ALL
SELECT
  pgs.game_id,
  pgs.player_id,
  'player_assists'::text AS prop_type,
  pgs.assists::numeric AS stat_value
FROM public.player_game_stats pgs;