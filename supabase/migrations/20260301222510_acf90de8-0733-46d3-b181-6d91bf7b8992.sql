-- Revert security_invoker on views to eliminate schema diff that causes DROP failures
-- The diff tool cannot handle DROP+recreate of views with dependencies

ALTER VIEW IF EXISTS public.np_v_prop_overlay SET (security_invoker = false);
ALTER VIEW IF EXISTS public.np_v_latest_prop_predictions SET (security_invoker = false);
ALTER VIEW IF EXISTS public.np_player_prop_stat_long SET (security_invoker = false);
ALTER VIEW IF EXISTS public.np_v_closing_lines SET (security_invoker = false);
ALTER VIEW IF EXISTS public.np_v_backtest_overlay SET (security_invoker = false);
ALTER VIEW IF EXISTS public.np_v_backtest_results SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_nfl_player_game_metrics SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_nfl_player_quarter_metrics SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_oracle_ml_nhl_v1 SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_oracle_ml_mlb_v1 SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_oracle_ml_nba_v1 SET (security_invoker = false);
ALTER VIEW IF EXISTS public.v_oracle_ml_nfl_v1 SET (security_invoker = false);