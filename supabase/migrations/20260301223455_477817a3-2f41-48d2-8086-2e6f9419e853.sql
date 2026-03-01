-- Align view security_invoker options in Test to match Live exactly,
-- preventing publish diff from attempting DROP/CREATE on dependent views.

-- Live expects invoker=true
ALTER VIEW IF EXISTS public.np_v_prop_overlay SET (security_invoker = true);
ALTER VIEW IF EXISTS public.np_v_latest_prop_predictions SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_nfl_player_game_metrics SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_nfl_player_quarter_metrics SET (security_invoker = on);

-- Live expects default (no explicit reloption)
ALTER VIEW IF EXISTS public.np_player_prop_stat_long RESET (security_invoker);
ALTER VIEW IF EXISTS public.np_v_closing_lines RESET (security_invoker);
ALTER VIEW IF EXISTS public.np_v_backtest_overlay RESET (security_invoker);
ALTER VIEW IF EXISTS public.np_v_backtest_results RESET (security_invoker);
ALTER VIEW IF EXISTS public.v_oracle_ml_nhl_v1 RESET (security_invoker);
ALTER VIEW IF EXISTS public.v_oracle_ml_mlb_v1 RESET (security_invoker);
ALTER VIEW IF EXISTS public.v_oracle_ml_nba_v1 RESET (security_invoker);
ALTER VIEW IF EXISTS public.v_oracle_ml_nfl_v1 RESET (security_invoker);