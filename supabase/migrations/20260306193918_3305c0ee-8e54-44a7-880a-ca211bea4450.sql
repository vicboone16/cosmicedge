-- Drop ALL ce_ views with CASCADE to handle hidden dependencies
DROP VIEW IF EXISTS public.ce_monte_input_heavy CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_heavy CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v3 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v6 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_injury_ripple CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v3 CASCADE;
DROP VIEW IF EXISTS public.ce_astro_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v2 CASCADE;
DROP VIEW IF EXISTS public.ce_streaks_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast CASCADE;
DROP VIEW IF EXISTS public.ce_momentum_live CASCADE;