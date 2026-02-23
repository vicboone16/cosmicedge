
-- Comprehensive SGO market odds table for ALL markets: game lines, player props, alts, periods
CREATE TABLE public.sgo_market_odds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  league text NOT NULL,
  odd_id text NOT NULL,
  bet_type text NOT NULL, -- 'ml', 'sp', 'ou'
  side text NOT NULL, -- 'home', 'away', 'over', 'under'
  period text NOT NULL DEFAULT 'full', -- 'full', '1Q', '2Q', '3Q', '4Q', '1H', '2H', 'OT', etc.
  stat_entity_id text NOT NULL DEFAULT 'all', -- 'all'/'home'/'away' for team, player ID for props
  stat_id text, -- 'points', 'rebounds', 'assists', etc.
  player_name text, -- formatted player name for display
  is_player_prop boolean NOT NULL DEFAULT false,
  is_alternate boolean NOT NULL DEFAULT false,
  bookmaker text NOT NULL DEFAULT 'consensus',
  odds integer, -- American odds
  line numeric, -- spread or over/under line
  available boolean NOT NULL DEFAULT true,
  last_updated_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_sgo_market_odds_game_id ON public.sgo_market_odds(game_id);
CREATE INDEX idx_sgo_market_odds_lookup ON public.sgo_market_odds(game_id, bet_type, period, stat_entity_id);
CREATE INDEX idx_sgo_market_odds_player ON public.sgo_market_odds(game_id, is_player_prop) WHERE is_player_prop = true;
CREATE INDEX idx_sgo_market_odds_event ON public.sgo_market_odds(event_id);
CREATE INDEX idx_sgo_market_odds_captured ON public.sgo_market_odds(captured_at DESC);

-- Unique constraint for upserts: one row per odd+bookmaker combo per capture window
CREATE UNIQUE INDEX idx_sgo_market_odds_upsert ON public.sgo_market_odds(game_id, odd_id, bookmaker);

-- Enable RLS
ALTER TABLE public.sgo_market_odds ENABLE ROW LEVEL SECURITY;

-- Public read access (odds are public data)
CREATE POLICY "SGO market odds are publicly readable"
  ON public.sgo_market_odds FOR SELECT
  USING (true);

-- Service role can manage
CREATE POLICY "Service role manages sgo_market_odds"
  ON public.sgo_market_odds FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
