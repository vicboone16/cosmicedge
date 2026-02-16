
-- Add admin DELETE policies for tables used in game cascade delete

-- games
CREATE POLICY "Admins can delete games"
ON public.games FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- odds_snapshots
CREATE POLICY "Admins can delete odds_snapshots"
ON public.odds_snapshots FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- play_by_play
CREATE POLICY "Admins can delete play_by_play"
ON public.play_by_play FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- game_state_snapshots
CREATE POLICY "Admins can delete game_state_snapshots"
ON public.game_state_snapshots FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- game_referees
CREATE POLICY "Admins can delete game_referees"
ON public.game_referees FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- player_game_stats
CREATE POLICY "Admins can delete player_game_stats"
ON public.player_game_stats FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- historical_odds
DROP POLICY IF EXISTS "Only service role can delete historical odds" ON public.historical_odds;
CREATE POLICY "Admins can delete historical_odds"
ON public.historical_odds FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- player_projections
CREATE POLICY "Admins can delete player_projections"
ON public.player_projections FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- player_props
DROP POLICY IF EXISTS "Only service role can delete player props" ON public.player_props;
CREATE POLICY "Admins can delete player_props"
ON public.player_props FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- alerts (admin override in addition to user's own)
CREATE POLICY "Admins can delete any alerts"
ON public.alerts FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- intel_notes (admin override)
CREATE POLICY "Admins can delete any intel_notes"
ON public.intel_notes FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- bets (admin override)
CREATE POLICY "Admins can delete any bets"
ON public.bets FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
