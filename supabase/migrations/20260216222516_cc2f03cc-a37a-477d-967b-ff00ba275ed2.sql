CREATE OR REPLACE FUNCTION public.search_players_unaccent(search_query text, max_results integer DEFAULT 10)
RETURNS TABLE(player_id uuid, player_name text, player_team text, player_position text, player_league text, player_headshot_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT p.id, p.name, p.team, p.position, p.league, p.headshot_url
  FROM public.players p
  WHERE f_unaccent(lower(p.name)) LIKE '%' || f_unaccent(lower(search_query)) || '%'
  ORDER BY p.name
  LIMIT max_results;
$$;