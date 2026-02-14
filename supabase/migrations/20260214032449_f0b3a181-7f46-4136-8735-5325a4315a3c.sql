
-- User settings table for persisting scoring weights, horary rules, astrology config, etc.
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Scoring weights
  stat_weight INTEGER NOT NULL DEFAULT 40,
  market_weight INTEGER NOT NULL DEFAULT 35,
  astro_weight INTEGER NOT NULL DEFAULT 25,
  -- Horary rules
  void_of_course BOOLEAN NOT NULL DEFAULT true,
  combustion BOOLEAN NOT NULL DEFAULT true,
  retrograde BOOLEAN NOT NULL DEFAULT true,
  reception_dignity BOOLEAN NOT NULL DEFAULT true,
  -- Astrology settings
  house_system TEXT NOT NULL DEFAULT 'Placidus',
  orb_size TEXT NOT NULL DEFAULT 'standard',
  -- Location & cartography
  travel_factors BOOLEAN NOT NULL DEFAULT true,
  astrocartography BOOLEAN NOT NULL DEFAULT true,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for game_state_snapshots so Live Board can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state_snapshots;
