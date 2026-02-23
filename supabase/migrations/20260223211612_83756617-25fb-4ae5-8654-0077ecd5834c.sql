
-- Table for NebulaProp model predictions
CREATE TABLE public.nebula_prop_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  prop_type TEXT NOT NULL,
  book TEXT NOT NULL DEFAULT 'CONSENSUS',
  edge_score NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  risk NUMERIC NOT NULL DEFAULT 0,
  mu NUMERIC NOT NULL DEFAULT 0,
  sigma NUMERIC NOT NULL DEFAULT 0,
  line NUMERIC,
  odds INTEGER,
  side TEXT DEFAULT 'over',
  hit_l10 NUMERIC,
  hit_l20 NUMERIC,
  streak INTEGER,
  microbars JSONB DEFAULT '[]'::jsonb,
  one_liner TEXT,
  pred_ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  astro JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id, prop_type, book)
);

-- Enable RLS
ALTER TABLE public.nebula_prop_predictions ENABLE ROW LEVEL SECURITY;

-- Public read, service_role write
CREATE POLICY "Nebula predictions are publicly readable"
ON public.nebula_prop_predictions FOR SELECT USING (true);

CREATE POLICY "Service role can manage nebula predictions"
ON public.nebula_prop_predictions FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Admin can also manage
CREATE POLICY "Admins can manage nebula predictions"
ON public.nebula_prop_predictions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_nebula_pred_game ON public.nebula_prop_predictions(game_id);
CREATE INDEX idx_nebula_pred_player ON public.nebula_prop_predictions(player_id);
CREATE INDEX idx_nebula_pred_edge ON public.nebula_prop_predictions(edge_score DESC);

-- View: overlay by key (latest per game/player/prop)
CREATE OR REPLACE VIEW public.np_v_prop_overlay AS
SELECT DISTINCT ON (npp.game_id, npp.player_id, npp.prop_type)
  npp.*,
  g.start_time AS game_start_time,
  g.home_abbr,
  g.away_abbr,
  g.league,
  p.name AS player_name,
  p.team AS player_team,
  p.headshot_url
FROM public.nebula_prop_predictions npp
JOIN public.games g ON g.id = npp.game_id
JOIN public.players p ON p.id = npp.player_id
ORDER BY npp.game_id, npp.player_id, npp.prop_type, npp.pred_ts DESC;

-- View: latest predictions with book priority (FanDuel > CONSENSUS)
CREATE OR REPLACE VIEW public.np_v_latest_prop_predictions AS
SELECT DISTINCT ON (npp.game_id, npp.player_id, npp.prop_type)
  npp.*,
  g.start_time AS game_start_time,
  g.home_abbr,
  g.away_abbr,
  g.league,
  p.name AS player_name,
  p.team AS player_team,
  p.headshot_url
FROM public.nebula_prop_predictions npp
JOIN public.games g ON g.id = npp.game_id
JOIN public.players p ON p.id = npp.player_id
ORDER BY npp.game_id, npp.player_id, npp.prop_type,
  CASE WHEN npp.book = 'FanDuel' THEN 0 ELSE 1 END,
  npp.pred_ts DESC;

-- Trigger for updated_at
CREATE TRIGGER update_nebula_pred_updated_at
BEFORE UPDATE ON public.nebula_prop_predictions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
