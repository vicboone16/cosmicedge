
-- ============================================================
-- SECURITY FIX: Enable RLS on all unprotected tables + policies
-- ============================================================

-- 1. admin_feature_access (already has 1 policy, just enable RLS)
ALTER TABLE public.admin_feature_access ENABLE ROW LEVEL SECURITY;

-- 2. app_feature_flags — public read for non-admin flags, admin full access
ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_public_flags" ON public.app_feature_flags
  FOR SELECT TO anon, authenticated
  USING (((config->>'admin_only')::boolean) IS NOT TRUE);

CREATE POLICY "admin_full_access_flags" ON public.app_feature_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. fantasy_scoring_rules — public read
ALTER TABLE public.fantasy_scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.fantasy_scoring_rules FOR SELECT TO anon, authenticated USING (true);

-- 4. live_game_visual_state — public read (pipeline writes via service_role)
ALTER TABLE public.live_game_visual_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.live_game_visual_state FOR SELECT TO anon, authenticated USING (true);

-- 5. live_player_stats — public read
ALTER TABLE public.live_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.live_player_stats FOR SELECT TO anon, authenticated USING (true);

-- 6. live_player_tracking — public read
ALTER TABLE public.live_player_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.live_player_tracking FOR SELECT TO anon, authenticated USING (true);

-- 7. migration_guard — no public access (service_role only)
ALTER TABLE public.migration_guard ENABLE ROW LEVEL SECURITY;

-- 8. normalized_pbp_events — public read
ALTER TABLE public.normalized_pbp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.normalized_pbp_events FOR SELECT TO anon, authenticated USING (true);

-- 9. normalized_pbp_event_tags — public read
ALTER TABLE public.normalized_pbp_event_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.normalized_pbp_event_tags FOR SELECT TO anon, authenticated USING (true);

-- 10. pbp_animation_catalog — public read
ALTER TABLE public.pbp_animation_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.pbp_animation_catalog FOR SELECT TO anon, authenticated USING (true);

-- 11. pbp_event_type_catalog — public read
ALTER TABLE public.pbp_event_type_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.pbp_event_type_catalog FOR SELECT TO anon, authenticated USING (true);

-- 12. pbp_parser_errors — no public access (service_role only)
ALTER TABLE public.pbp_parser_errors ENABLE ROW LEVEL SECURITY;

-- 13. pbp_zone_catalog — public read
ALTER TABLE public.pbp_zone_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.pbp_zone_catalog FOR SELECT TO anon, authenticated USING (true);

-- 14. play_by_play_raw — no public access (service_role only)
ALTER TABLE public.play_by_play_raw ENABLE ROW LEVEL SECURITY;

-- 15. release_markers — public read
ALTER TABLE public.release_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.release_markers FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- SECURITY FIX: Set security_invoker=true on all definer views
-- ============================================================

ALTER VIEW public.ce_active_prop_date SET (security_invoker = true);
ALTER VIEW public.ce_defense_difficulty SET (security_invoker = true);
ALTER VIEW public.ce_momentum_live SET (security_invoker = true);
ALTER VIEW public.ce_player_current_team SET (security_invoker = true);
ALTER VIEW public.ce_player_game_logs_src SET (security_invoker = true);
ALTER VIEW public.ce_players_name_map SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v2 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v3 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v4 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v5 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v6 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v7 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_fast_v8 SET (security_invoker = true);
ALTER VIEW public.ce_scorecards_live SET (security_invoker = true);
ALTER VIEW public.ce_stat_correlations SET (security_invoker = true);
ALTER VIEW public.ce_streaks_live SET (security_invoker = true);
ALTER VIEW public.ce_usage_baseline SET (security_invoker = true);
ALTER VIEW public.ce_usage_shift SET (security_invoker = true);
ALTER VIEW public.ce_usage_spikes SET (security_invoker = true);
ALTER VIEW public.fantasy_scores SET (security_invoker = true);
ALTER VIEW public.live_player_fantasy_scores SET (security_invoker = true);
ALTER VIEW public.live_player_projections SET (security_invoker = true);
ALTER VIEW public.live_player_rates SET (security_invoker = true);
ALTER VIEW public.live_player_stats_aggregated SET (security_invoker = true);
ALTER VIEW public.live_player_stats_by_window SET (security_invoker = true);
ALTER VIEW public.live_player_tracking_pbp_patch SET (security_invoker = true);
ALTER VIEW public.np_player_prop_stat_long SET (security_invoker = true);
ALTER VIEW public.np_v_backtest_overlay SET (security_invoker = true);
ALTER VIEW public.np_v_backtest_results SET (security_invoker = true);
ALTER VIEW public.np_v_closing_lines SET (security_invoker = true);
ALTER VIEW public.np_v_latest_prop_predictions SET (security_invoker = true);
ALTER VIEW public.np_v_prop_overlay SET (security_invoker = true);
ALTER VIEW public.parsed_events SET (security_invoker = true);
ALTER VIEW public.pbp_event_participants SET (security_invoker = true);
ALTER VIEW public.pbp_parsed_events SET (security_invoker = true);
ALTER VIEW public.pbp_stat_deltas SET (security_invoker = true);
ALTER VIEW public.pbp_substitution_events SET (security_invoker = true);
ALTER VIEW public.play_by_play_ordered SET (security_invoker = true);
ALTER VIEW public.play_by_play_quarter_corrected SET (security_invoker = true);
ALTER VIEW public.play_by_play_scores SET (security_invoker = true);
ALTER VIEW public.player_event_stats SET (security_invoker = true);
ALTER VIEW public.player_stats_by_window SET (security_invoker = true);
ALTER VIEW public.schema_drift_report SET (security_invoker = true);
ALTER VIEW public.tt_admin_dashboard SET (security_invoker = true);
ALTER VIEW public.tt_best_opportunities SET (security_invoker = true);
ALTER VIEW public.tt_live_learned_probs SET (security_invoker = true);
ALTER VIEW public.tt_live_model SET (security_invoker = true);
ALTER VIEW public.tt_match_list SET (security_invoker = true);
ALTER VIEW public.tt_momentum_shock SET (security_invoker = true);
ALTER VIEW public.tt_momentum_signal SET (security_invoker = true);
ALTER VIEW public.v_astra_ritual_center SET (security_invoker = true);
ALTER VIEW public.v_current_game_players SET (security_invoker = true);
ALTER VIEW public.v_game_elapsed_time SET (security_invoker = true);
ALTER VIEW public.v_game_id_bridge_candidates SET (security_invoker = true);
ALTER VIEW public.v_game_latest_snapshot SET (security_invoker = true);
ALTER VIEW public.v_game_live_pace SET (security_invoker = true);
ALTER VIEW public.v_game_live_state SET (security_invoker = true);
ALTER VIEW public.v_game_momentum SET (security_invoker = true);
ALTER VIEW public.v_game_possession_counts SET (security_invoker = true);
ALTER VIEW public.v_game_recent_runs SET (security_invoker = true);
ALTER VIEW public.v_game_scoring_droughts SET (security_invoker = true);
ALTER VIEW public.v_game_state_snapshots_latest SET (security_invoker = true);
ALTER VIEW public.v_game_state_snapshots_latest_v2 SET (security_invoker = true);
ALTER VIEW public.v_game_watch_debug SET (security_invoker = true);
ALTER VIEW public.v_game_watch_derived_metrics SET (security_invoker = true);
ALTER VIEW public.v_latest_normalized_pbp_events SET (security_invoker = true);
ALTER VIEW public.v_latest_possession_signal SET (security_invoker = true);
ALTER VIEW public.v_live_game_pace SET (security_invoker = true);
ALTER VIEW public.v_live_player_pie SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_debug_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_latest_possession_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_momentum_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_oreb_pressure_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_pace_proxy_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_player_involvement_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_recent_runs_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_scoring_droughts_v2 SET (security_invoker = true);
ALTER VIEW public.v_nba_pbp_source_v2 SET (security_invoker = true);
ALTER VIEW public.v_nfl_player_game_metrics SET (security_invoker = true);
ALTER VIEW public.v_nfl_player_quarter_metrics SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_mlb_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nba_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nfl_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_ml_nhl_v1 SET (security_invoker = true);
ALTER VIEW public.v_oracle_player_validity SET (security_invoker = true);
ALTER VIEW public.v_prop_overlay_enhanced SET (security_invoker = true);
ALTER VIEW public.view_dependency_report SET (security_invoker = true);
