
ALTER TABLE public.team_season_pace
  ADD COLUMN IF NOT EXISTS off_efg_pct numeric,
  ADD COLUMN IF NOT EXISTS def_efg_pct numeric,
  ADD COLUMN IF NOT EXISTS off_tov_pct numeric,
  ADD COLUMN IF NOT EXISTS def_tov_pct numeric;
