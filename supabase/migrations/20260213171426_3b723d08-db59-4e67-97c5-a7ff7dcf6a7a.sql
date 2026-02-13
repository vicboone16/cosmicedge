-- Historical odds snapshots for backtesting
CREATE TABLE public.historical_odds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid REFERENCES public.games(id),
  external_event_id text,
  league text NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  start_time timestamp with time zone NOT NULL,
  market_type text NOT NULL,
  bookmaker text NOT NULL,
  home_price integer,
  away_price integer,
  line double precision,
  snapshot_date date NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.historical_odds ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Historical odds are publicly readable"
  ON public.historical_odds FOR SELECT USING (true);

-- Service role only write
CREATE POLICY "Only service role can insert historical odds"
  ON public.historical_odds FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can delete historical odds"
  ON public.historical_odds FOR DELETE
  USING (auth.role() = 'service_role');

-- Indexes for efficient querying
CREATE INDEX idx_historical_odds_league_date ON public.historical_odds(league, snapshot_date);
CREATE INDEX idx_historical_odds_game_id ON public.historical_odds(game_id);
CREATE INDEX idx_historical_odds_event_id ON public.historical_odds(external_event_id);