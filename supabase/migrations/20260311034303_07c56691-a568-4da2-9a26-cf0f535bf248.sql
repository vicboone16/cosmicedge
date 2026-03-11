-- Enable RLS on all 20 unprotected tables

-- ce_* tables with client-side read access (anon SELECT, admin write)
ALTER TABLE public.ce_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.ce_formulas FOR SELECT USING (true);
CREATE POLICY "admin_write" ON public.ce_formulas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.ce_engine_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.ce_engine_registry FOR SELECT USING (true);
CREATE POLICY "admin_write" ON public.ce_engine_registry FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.ce_info_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.ce_info_pages FOR SELECT USING (true);
CREATE POLICY "admin_write" ON public.ce_info_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.ce_glossary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.ce_glossary FOR SELECT USING (true);
CREATE POLICY "admin_write" ON public.ce_glossary FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ce_* internal tables (service_role only)
ALTER TABLE public.ce_astro_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_astro_overrides FOR ALL USING (false);

ALTER TABLE public.ce_injury_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_injury_overrides FOR ALL USING (false);

ALTER TABLE public.ce_injury_ripple_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_injury_ripple_overrides FOR ALL USING (false);

ALTER TABLE public.ce_injury_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_injury_status FOR ALL USING (false);

ALTER TABLE public.ce_matchup_difficulty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_matchup_difficulty FOR ALL USING (false);

ALTER TABLE public.ce_matchup_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_matchup_overrides FOR ALL USING (false);

ALTER TABLE public.ce_props_norm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.ce_props_norm FOR ALL USING (false);

-- tt_* tables (service_role only)
ALTER TABLE public.tt_market_odds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_market_odds FOR ALL USING (false);

ALTER TABLE public.tt_match_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_match_events FOR ALL USING (false);

ALTER TABLE public.tt_match_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_match_metrics FOR ALL USING (false);

ALTER TABLE public.tt_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_points FOR ALL USING (false);

ALTER TABLE public.tt_prob_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_prob_history FOR ALL USING (false);

ALTER TABLE public.tt_recalc_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_recalc_queue FOR ALL USING (false);

ALTER TABLE public.tt_score_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_score_states FOR ALL USING (false);

ALTER TABLE public.tt_serve_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_serve_stats FOR ALL USING (false);

ALTER TABLE public.tt_state_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.tt_state_matrix FOR ALL USING (false);