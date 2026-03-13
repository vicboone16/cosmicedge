
-- bet_slips: parent slip record
CREATE TABLE public.bet_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book text NOT NULL DEFAULT 'prizepicks',
  entry_type text DEFAULT 'power',
  stake numeric DEFAULT 0,
  payout numeric DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  status text NOT NULL DEFAULT 'active',
  result text,
  settled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bet_slips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own slips" ON public.bet_slips
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- tracked_prop_shells: synthetic props for unmatched picks
CREATE TABLE public.tracked_prop_shells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  player_name_raw text NOT NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  game_label_raw text,
  sport text DEFAULT 'NBA',
  book text DEFAULT 'prizepicks',
  market_type text,
  market_scope text,
  stat_type text NOT NULL,
  stat_label_raw text,
  line numeric NOT NULL,
  direction text DEFAULT 'over',
  team text,
  opponent text,
  source text DEFAULT 'import',
  match_status text NOT NULL DEFAULT 'unresolved',
  tracking_mode text DEFAULT 'synthetic',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracked_prop_shells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shells" ON public.tracked_prop_shells
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage shells" ON public.tracked_prop_shells
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- bet_slip_picks: individual picks within a slip
CREATE TABLE public.bet_slip_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL REFERENCES public.bet_slips(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  player_name_raw text NOT NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  prop_shell_id uuid REFERENCES public.tracked_prop_shells(id) ON DELETE SET NULL,
  stat_type text NOT NULL,
  line numeric NOT NULL,
  direction text NOT NULL DEFAULT 'over',
  live_value numeric,
  progress numeric,
  result text,
  match_status text NOT NULL DEFAULT 'unresolved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bet_slip_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own picks via slip" ON public.bet_slip_picks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bet_slips bs WHERE bs.id = slip_id AND bs.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bet_slips bs WHERE bs.id = slip_id AND bs.user_id = auth.uid()));
