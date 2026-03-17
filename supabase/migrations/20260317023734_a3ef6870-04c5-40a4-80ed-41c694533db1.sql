-- Astra Decision Engine: structured bet assessment storage
CREATE TABLE IF NOT EXISTS public.astra_bet_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query_text text,
  query_type text NOT NULL DEFAULT 'player_prop',
  bet_type text,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  team_id text,
  market_type text,
  direction text,
  line_value numeric,
  odds integer,
  current_stat numeric,
  projected_final numeric,
  hit_probability numeric,
  implied_probability numeric,
  expected_value numeric,
  minutes_security_score numeric,
  foul_risk_level text,
  blowout_risk_level text,
  game_momentum_state text,
  player_momentum_state text,
  astro_signal text,
  risk_grade text,
  confidence_grade text,
  decision_label text NOT NULL DEFAULT 'neutral',
  decision_score numeric,
  primary_reason text,
  secondary_reason text,
  warning_note text,
  alternative_suggestion text,
  answer_summary text,
  engine_inputs jsonb DEFAULT '{}'::jsonb,
  engine_outputs jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astra_bet_assessment_user ON public.astra_bet_assessment(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_astra_bet_assessment_game ON public.astra_bet_assessment(game_id) WHERE game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_astra_bet_assessment_player ON public.astra_bet_assessment(player_id) WHERE player_id IS NOT NULL;

ALTER TABLE public.astra_bet_assessment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own assessments"
  ON public.astra_bet_assessment FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assessments"
  ON public.astra_bet_assessment FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);