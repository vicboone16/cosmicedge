CREATE TABLE IF NOT EXISTS public.pregame_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  market_type text NOT NULL,
  home_price numeric,
  away_price numeric,
  line numeric,
  bookmaker text DEFAULT 'consensus',
  frozen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, market_type, bookmaker)
);

ALTER TABLE public.pregame_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pregame_odds"
  ON public.pregame_odds FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert pregame_odds"
  ON public.pregame_odds FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX idx_pregame_odds_game ON public.pregame_odds(game_id);