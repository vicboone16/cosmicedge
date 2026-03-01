-- Fix 2: Set all public views to security_invoker = true
-- This ensures views use the querying user's permissions, not the view creator's

ALTER VIEW public.np_v_prop_overlay SET (security_invoker = true);
ALTER VIEW public.np_v_latest_prop_predictions SET (security_invoker = true);
ALTER VIEW public.np_player_prop_stat_long SET (security_invoker = true);
ALTER VIEW public.np_v_closing_lines SET (security_invoker = true);
ALTER VIEW public.np_v_backtest_overlay SET (security_invoker = true);
ALTER VIEW public.np_v_backtest_results SET (security_invoker = true);
ALTER VIEW public.v_nfl_player_game_metrics SET (security_invoker = true);
ALTER VIEW public.v_nfl_player_quarter_metrics SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nhl_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_mlb_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nba_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nfl_v1 SET (security_invoker = true);
