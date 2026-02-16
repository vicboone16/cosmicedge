-- Create an immutable unaccent wrapper for use in indexes
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = 'public';

-- Create a functional index for accent-insensitive player name search
CREATE INDEX IF NOT EXISTS idx_players_name_unaccent ON public.players (f_unaccent(lower(name)));
