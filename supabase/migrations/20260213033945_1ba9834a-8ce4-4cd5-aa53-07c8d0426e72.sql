
-- Player props table to store projections from The Odds API
CREATE TABLE public.player_props (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  external_event_id TEXT,
  player_name TEXT NOT NULL,
  market_key TEXT NOT NULL,
  market_label TEXT,
  bookmaker TEXT NOT NULL,
  line NUMERIC,
  over_price INTEGER,
  under_price INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.player_props ENABLE ROW LEVEL SECURITY;

-- Public read access (props are not user-specific)
CREATE POLICY "Player props are publicly readable"
  ON public.player_props FOR SELECT
  USING (true);

-- Service role can insert (edge function uses service role)
CREATE POLICY "Service role can insert player props"
  ON public.player_props FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete player props"
  ON public.player_props FOR DELETE
  USING (true);

-- Index for fast lookups
CREATE INDEX idx_player_props_game_id ON public.player_props(game_id);
CREATE INDEX idx_player_props_market ON public.player_props(market_key);
CREATE INDEX idx_player_props_player ON public.player_props(player_name);
