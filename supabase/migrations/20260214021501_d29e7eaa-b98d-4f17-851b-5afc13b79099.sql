
-- Pre-computed quant model cache per game/entity
CREATE TABLE public.quant_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'game',  -- 'game', 'player'
  entity_id TEXT NOT NULL DEFAULT '_game',   -- team_abbr pair or player_id
  models JSONB NOT NULL DEFAULT '[]',
  verdict JSONB NOT NULL DEFAULT '{}',
  market_snapshot JSONB NOT NULL DEFAULT '{}',
  signals JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '4 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for upserts
CREATE UNIQUE INDEX uq_quant_cache_game_entity 
  ON public.quant_cache(game_id, entity_type, entity_id);

-- Index for expiry-based cleanup
CREATE INDEX idx_quant_cache_expires ON public.quant_cache(expires_at);

-- Index for quick lookups
CREATE INDEX idx_quant_cache_game ON public.quant_cache(game_id);

-- RLS: public read (no auth needed for quant data), no direct writes from client
ALTER TABLE public.quant_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quant cache is publicly readable"
  ON public.quant_cache FOR SELECT
  USING (true);
