-- Repair publish blocker: align CE view reloptions in Test to current Live state
-- This prevents diff engine from generating dependency-breaking DROP VIEW operations.

-- Views that should NOT have security_invoker=true (match Live)
ALTER VIEW IF EXISTS public.ce_active_prop_date RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_defense_difficulty RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_momentum_live RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_player_current_team RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_player_game_logs_src RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_players_name_map RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v2 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v3 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v4 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v5 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v6 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v7 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v8 RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_scorecards_live RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_stat_correlations RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_streaks_live RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_usage_baseline RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_usage_shift RESET (security_invoker);
ALTER VIEW IF EXISTS public.ce_usage_spikes RESET (security_invoker);

-- Views that SHOULD have security_invoker=true (match Live)
ALTER VIEW IF EXISTS public.ce_correlation_flags SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_monte_input_heavy_v5 SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_monte_input_supermodel SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_scorecards_fast_v9 SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_scorecards_top_25_v4 SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_scorecards_top_v4 SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_supermodel SET (security_invoker=true);
ALTER VIEW IF EXISTS public.ce_supermodel_top_plays SET (security_invoker=true);