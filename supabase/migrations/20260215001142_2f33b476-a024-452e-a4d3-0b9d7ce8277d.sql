
-- Add Basketball Reference advanced metrics to team_game_stats
ALTER TABLE public.team_game_stats
  ADD COLUMN IF NOT EXISTS ts_pct numeric,
  ADD COLUMN IF NOT EXISTS trb_pct numeric,
  ADD COLUMN IF NOT EXISTS ast_pct numeric,
  ADD COLUMN IF NOT EXISTS stl_pct numeric,
  ADD COLUMN IF NOT EXISTS blk_pct numeric,
  ADD COLUMN IF NOT EXISTS ftr numeric,
  ADD COLUMN IF NOT EXISTS three_par numeric,
  ADD COLUMN IF NOT EXISTS efg_pct numeric,
  ADD COLUMN IF NOT EXISTS tov_pct numeric,
  ADD COLUMN IF NOT EXISTS orb_pct numeric,
  ADD COLUMN IF NOT EXISTS ft_per_fga numeric,
  ADD COLUMN IF NOT EXISTS opp_efg_pct numeric,
  ADD COLUMN IF NOT EXISTS opp_tov_pct numeric,
  ADD COLUMN IF NOT EXISTS opp_orb_pct numeric,
  ADD COLUMN IF NOT EXISTS opp_ft_per_fga numeric,
  ADD COLUMN IF NOT EXISTS overtimes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'api';
