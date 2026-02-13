
-- Drop overly permissive policies
DROP POLICY "Service role can insert player props" ON public.player_props;
DROP POLICY "Service role can delete player props" ON public.player_props;

-- Only allow inserts/deletes via service_role (not anon)
CREATE POLICY "Only service role can insert player props"
  ON public.player_props FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete player props"
  ON public.player_props FOR DELETE
  USING (auth.role() = 'service_role');
