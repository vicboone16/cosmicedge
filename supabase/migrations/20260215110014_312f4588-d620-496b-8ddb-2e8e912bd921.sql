
-- Create backtest_results table
CREATE TABLE public.backtest_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  league TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  total_games INTEGER NOT NULL DEFAULT 0,
  correct_picks INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC NOT NULL DEFAULT 0,
  layer_breakdown JSONB DEFAULT '{}',
  roi_simulation JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtest results"
  ON public.backtest_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backtest results"
  ON public.backtest_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own backtest results"
  ON public.backtest_results FOR DELETE
  USING (auth.uid() = user_id);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  threshold NUMERIC,
  message TEXT,
  triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON public.alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own alerts"
  ON public.alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
  ON public.alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts"
  ON public.alerts FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime on alerts for push notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
