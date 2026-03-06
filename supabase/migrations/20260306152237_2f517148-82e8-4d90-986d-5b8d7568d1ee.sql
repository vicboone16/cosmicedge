
-- Create ce_uuid_to_bigint function (exists on Live, missing from Test)
CREATE OR REPLACE FUNCTION public.ce_uuid_to_bigint(p_text text)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ('x' || substr(md5(p_text), 1, 16))::bit(64)::bigint;
$function$;

-- Create ce_player_game_logs_src view
CREATE OR REPLACE VIEW public.ce_player_game_logs_src AS
SELECT game_id,
    (created_at)::date AS game_date,
    ce_uuid_to_bigint((player_id)::text) AS player_id,
    NULL::integer AS team_id,
    NULL::integer AS opponent_team_id,
    (COALESCE(points, 0))::numeric AS pts,
    (COALESCE(rebounds, 0))::numeric AS reb,
    (COALESCE(assists, 0))::numeric AS ast,
    (COALESCE(three_made, 0))::numeric AS fg3m,
    (COALESCE(steals, 0))::numeric AS stl,
    (COALESCE(blocks, 0))::numeric AS blk,
    (COALESCE(turnovers, 0))::numeric AS tov,
    (COALESCE(minutes, 0))::numeric AS minutes,
    (plus_minus)::numeric AS plus_minus,
    NULL::numeric AS pie
   FROM player_game_stats pgs
  WHERE game_id IS NOT NULL AND player_id IS NOT NULL AND created_at IS NOT NULL;

-- Create ce_players_name_map view
CREATE OR REPLACE VIEW public.ce_players_name_map AS
SELECT ce_uuid_to_bigint((to_jsonb(p.*) ->> 'id'::text)) AS model_player_id,
    lower(regexp_replace(TRIM(BOTH FROM COALESCE(NULLIF((to_jsonb(p.*) ->> 'name'::text), ''::text), NULLIF((to_jsonb(p.*) ->> 'full_name'::text), ''::text), concat_ws(' '::text, NULLIF((to_jsonb(p.*) ->> 'first_name'::text), ''::text), NULLIF((to_jsonb(p.*) ->> 'last_name'::text), ''::text)))), '[^a-z0-9 ]'::text, ''::text, 'g'::text)) AS player_name_norm
   FROM players p
  WHERE COALESCE(NULLIF((to_jsonb(p.*) ->> 'name'::text), ''::text), NULLIF((to_jsonb(p.*) ->> 'full_name'::text), ''::text), concat_ws(' '::text, NULLIF((to_jsonb(p.*) ->> 'first_name'::text), ''::text), NULLIF((to_jsonb(p.*) ->> 'last_name'::text), ''::text))) IS NOT NULL;
