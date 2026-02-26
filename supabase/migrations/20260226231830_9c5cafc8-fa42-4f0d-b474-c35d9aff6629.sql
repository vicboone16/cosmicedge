
ALTER TABLE public.team_season_pace
  ADD COLUMN IF NOT EXISTS ts_pct numeric,
  ADD COLUMN IF NOT EXISTS efg_pct numeric,
  ADD COLUMN IF NOT EXISTS tov_pct numeric;
