
-- Drop legacy views in Live that block the migration
DROP VIEW IF EXISTS public.np_v_model_status_by_game CASCADE;
DROP VIEW IF EXISTS public.np_prop_features CASCADE;
DROP VIEW IF EXISTS public.np_prop_odds CASCADE;
DROP VIEW IF EXISTS public.np_prop_predictions CASCADE;

-- Recreate the two canonical views
DROP VIEW IF EXISTS public.np_v_prop_overlay CASCADE;
DROP VIEW IF EXISTS public.np_v_latest_prop_predictions CASCADE;

CREATE OR REPLACE VIEW public.np_v_prop_overlay
WITH (security_invoker = true) AS
SELECT DISTINCT ON (npp.game_id, npp.player_id, npp.prop_type)
  npp.*,
  g.start_time AS game_start_time,
  g.home_abbr,
  g.away_abbr,
  g.league,
  p.name AS player_name,
  p.team AS player_team,
  p.headshot_url
FROM public.nebula_prop_predictions npp
JOIN public.games g ON g.id = npp.game_id
JOIN public.players p ON p.id = npp.player_id
ORDER BY npp.game_id, npp.player_id, npp.prop_type, npp.pred_ts DESC;

CREATE OR REPLACE VIEW public.np_v_latest_prop_predictions
WITH (security_invoker = true) AS
SELECT DISTINCT ON (npp.game_id, npp.player_id, npp.prop_type)
  npp.*,
  g.start_time AS game_start_time,
  g.home_abbr,
  g.away_abbr,
  g.league,
  p.name AS player_name,
  p.team AS player_team,
  p.headshot_url
FROM public.nebula_prop_predictions npp
JOIN public.games g ON g.id = npp.game_id
JOIN public.players p ON p.id = npp.player_id
ORDER BY npp.game_id, npp.player_id, npp.prop_type,
  CASE WHEN npp.book = 'FanDuel' THEN 0 ELSE 1 END,
  npp.pred_ts DESC;
