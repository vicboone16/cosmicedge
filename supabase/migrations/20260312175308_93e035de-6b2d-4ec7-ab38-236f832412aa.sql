-- games: add INSERT
CREATE POLICY "Admins can insert games"
ON public.games FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- play_by_play: add INSERT, UPDATE
CREATE POLICY "Admins can insert play_by_play"
ON public.play_by_play FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update play_by_play"
ON public.play_by_play FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- pbp_events: add INSERT, UPDATE, DELETE
CREATE POLICY "Admins can insert pbp_events"
ON public.pbp_events FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pbp_events"
ON public.pbp_events FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pbp_events"
ON public.pbp_events FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- nba_play_by_play_events: add UPDATE
CREATE POLICY "Admins can update nba_play_by_play_events"
ON public.nba_play_by_play_events FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- game_state_snapshots: add INSERT, UPDATE
CREATE POLICY "Admins can insert game_state_snapshots"
ON public.game_state_snapshots FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update game_state_snapshots"
ON public.game_state_snapshots FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- player_season_stats: add INSERT, UPDATE, DELETE
CREATE POLICY "Admins can insert player_season_stats"
ON public.player_season_stats FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update player_season_stats"
ON public.player_season_stats FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete player_season_stats"
ON public.player_season_stats FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));