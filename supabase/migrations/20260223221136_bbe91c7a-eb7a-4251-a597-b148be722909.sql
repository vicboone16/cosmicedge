
-- Drop ALL legacy views that block migrations in Live
-- These depend on nebula_prop_predictions and must be removed first
DROP VIEW IF EXISTS public.np_v_model_status_by_game CASCADE;
DROP VIEW IF EXISTS public.np_prop_features CASCADE;
DROP VIEW IF EXISTS public.np_prop_odds CASCADE;
DROP VIEW IF EXISTS public.np_prop_predictions CASCADE;
DROP VIEW IF EXISTS public.np_v_prop_overlay CASCADE;
DROP VIEW IF EXISTS public.np_v_latest_prop_predictions CASCADE;

-- Ensure table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.nebula_prop_predictions (
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
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nebula_prop_predictions_game_id_player_id_prop_type_book_key'
  ) THEN
    ALTER TABLE public.nebula_prop_predictions ADD CONSTRAINT nebula_prop_predictions_game_id_player_id_prop_type_book_key UNIQUE(game_id, player_id, prop_type, book);
  END IF;
END$$;

-- Ensure RLS
ALTER TABLE public.nebula_prop_predictions ENABLE ROW LEVEL SECURITY;

-- Idempotent policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Nebula predictions are publicly readable' AND tablename = 'nebula_prop_predictions') THEN
    CREATE POLICY "Nebula predictions are publicly readable" ON public.nebula_prop_predictions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage nebula predictions' AND tablename = 'nebula_prop_predictions') THEN
    CREATE POLICY "Service role can manage nebula predictions" ON public.nebula_prop_predictions FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage nebula predictions' AND tablename = 'nebula_prop_predictions') THEN
    CREATE POLICY "Admins can manage nebula predictions" ON public.nebula_prop_predictions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END$$;

-- Idempotent indexes
CREATE INDEX IF NOT EXISTS idx_nebula_pred_game ON public.nebula_prop_predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_nebula_pred_player ON public.nebula_prop_predictions(player_id);
CREATE INDEX IF NOT EXISTS idx_nebula_pred_edge ON public.nebula_prop_predictions(edge_score DESC);

-- Recreate canonical views
CREATE OR REPLACE VIEW public.np_v_prop_overlay
WITH (security_invoker = true) AS
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

CREATE OR REPLACE VIEW public.np_v_latest_prop_predictions
WITH (security_invoker = true) AS
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

-- Ensure trigger exists
DROP TRIGGER IF EXISTS update_nebula_pred_updated_at ON public.nebula_prop_predictions;
CREATE TRIGGER update_nebula_pred_updated_at
BEFORE UPDATE ON public.nebula_prop_predictions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
