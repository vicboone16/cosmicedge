
-- Tighten insert/delete to require admin role
DROP POLICY "Service role can insert nba pbp events" ON public.nba_play_by_play_events;
DROP POLICY "Service role can delete nba pbp events" ON public.nba_play_by_play_events;

CREATE POLICY "Admins can insert nba pbp events"
  ON public.nba_play_by_play_events FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete nba pbp events"
  ON public.nba_play_by_play_events FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
