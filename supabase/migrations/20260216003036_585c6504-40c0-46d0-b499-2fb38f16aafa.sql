-- Allow admins to insert/update/delete game_quarters
CREATE POLICY "Admins can insert game_quarters"
ON public.game_quarters
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update game_quarters"
ON public.game_quarters
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete game_quarters"
ON public.game_quarters
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));