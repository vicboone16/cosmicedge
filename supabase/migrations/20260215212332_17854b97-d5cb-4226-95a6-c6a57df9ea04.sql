-- Allow admins to update games
CREATE POLICY "Admins can update games"
ON public.games
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert odds_snapshots
CREATE POLICY "Admins can insert odds_snapshots"
ON public.odds_snapshots
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));