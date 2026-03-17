
-- 1. Enable RLS on admin_feature_access and add admin-only policy
ALTER TABLE public.admin_feature_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only_access" ON public.admin_feature_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Enable RLS on astra_opportunity_feed with owner-scoped policy
ALTER TABLE public.astra_opportunity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read" ON public.astra_opportunity_feed
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_write" ON public.astra_opportunity_feed
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Fix nba_game_odds: drop the misconfigured public policy and create a proper one
DROP POLICY IF EXISTS "Service role full access on nba_game_odds" ON public.nba_game_odds;

CREATE POLICY "service_role_only" ON public.nba_game_odds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.nba_game_odds
  FOR SELECT
  TO authenticated
  USING (true);
