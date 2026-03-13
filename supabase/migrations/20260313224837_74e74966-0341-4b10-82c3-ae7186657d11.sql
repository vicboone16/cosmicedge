
-- Custom Models table
CREATE TABLE public.custom_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sport text NOT NULL DEFAULT 'NBA',
  market_type text NOT NULL DEFAULT 'player_prop',
  target_output text NOT NULL DEFAULT 'over_under',
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT false,
  is_default boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User prediction runs
CREATE TABLE public.custom_model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES public.custom_models(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  model_key text,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  sport text,
  market_type text,
  inputs jsonb DEFAULT '{}'::jsonb,
  outputs jsonb DEFAULT '{}'::jsonb,
  explanation text,
  calculation_trace jsonb,
  confidence numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_model_runs ENABLE ROW LEVEL SECURITY;

-- custom_models policies
CREATE POLICY "Users can read own models" ON public.custom_models FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own models" ON public.custom_models FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own models" ON public.custom_models FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own models" ON public.custom_models FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all models" ON public.custom_models FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- custom_model_runs policies
CREATE POLICY "Users can read own custom runs" ON public.custom_model_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own custom runs" ON public.custom_model_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own custom runs" ON public.custom_model_runs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all custom runs" ON public.custom_model_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
