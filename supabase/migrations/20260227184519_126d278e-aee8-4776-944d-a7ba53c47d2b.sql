
CREATE TABLE public.team_period_averages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_abbr TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 2025,
  league TEXT NOT NULL DEFAULT 'NBA',
  period TEXT NOT NULL, -- 'Q1','Q2','Q3','Q4','1H','2H','OT'
  avg_points NUMERIC,
  avg_points_allowed NUMERIC,
  avg_pace NUMERIC,
  avg_fg_pct NUMERIC,
  avg_three_pct NUMERIC,
  avg_ft_pct NUMERIC,
  games_played INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_abbr, season, league, period)
);

ALTER TABLE public.team_period_averages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read team_period_averages"
  ON public.team_period_averages FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage team_period_averages"
  ON public.team_period_averages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));
