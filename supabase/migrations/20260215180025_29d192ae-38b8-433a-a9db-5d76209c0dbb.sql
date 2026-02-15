
-- Add starting bankroll to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS starting_bankroll numeric DEFAULT 0;

-- Create table for saved backtest weight presets
CREATE TABLE public.backtest_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  home_away_splits numeric NOT NULL DEFAULT 0.15,
  schedule_fatigue numeric NOT NULL DEFAULT 0.10,
  recent_form numeric NOT NULL DEFAULT 0.10,
  h2h_history numeric NOT NULL DEFAULT 0.05,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own presets" ON public.backtest_presets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_backtest_presets_updated_at
  BEFORE UPDATE ON public.backtest_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
