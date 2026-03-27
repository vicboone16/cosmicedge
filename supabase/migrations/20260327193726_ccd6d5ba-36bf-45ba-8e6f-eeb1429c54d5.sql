
CREATE TABLE public.prop_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  stat_type TEXT NOT NULL,
  line FLOAT NOT NULL,
  num_simulations INT NOT NULL DEFAULT 10000,
  prob_over FLOAT NOT NULL,
  prob_under FLOAT NOT NULL,
  projected_value FLOAT NOT NULL,
  edge_over FLOAT,
  edge_under FLOAT,
  implied_prob_over FLOAT,
  implied_prob_under FLOAT,
  percentile_10 FLOAT,
  percentile_25 FLOAT,
  percentile_50 FLOAT,
  percentile_75 FLOAT,
  percentile_90 FLOAT,
  fantasy_points_mean FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_name, stat_type, line)
);

ALTER TABLE public.prop_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read prop_simulations" ON public.prop_simulations FOR SELECT USING (true);

CREATE INDEX idx_prop_simulations_game ON public.prop_simulations(game_id);
CREATE INDEX idx_prop_simulations_player ON public.prop_simulations(player_name);

CREATE TRIGGER set_prop_simulations_updated_at BEFORE UPDATE ON public.prop_simulations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
