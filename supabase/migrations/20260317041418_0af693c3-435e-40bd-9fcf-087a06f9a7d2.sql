
-- Model Activation State: single source of truth per scope
CREATE TABLE public.model_activation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL DEFAULT 'global',
  scope_key text NOT NULL DEFAULT 'default',
  active_model_id uuid NOT NULL,
  active_model_version text,
  activated_by uuid REFERENCES auth.users(id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  runtime_confirmed_at timestamptz,
  runtime_status text NOT NULL DEFAULT 'pending' CHECK (runtime_status IN ('pending', 'confirmed', 'failed')),
  cache_bust_token text DEFAULT gen_random_uuid()::text,
  notes text,
  UNIQUE (scope_type, scope_key)
);

ALTER TABLE public.model_activation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage activation" ON public.model_activation_state
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read activation" ON public.model_activation_state
  FOR SELECT TO authenticated
  USING (true);

-- Model Activation Audit Log
CREATE TABLE public.model_activation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_key text NOT NULL,
  previous_model_id uuid,
  new_model_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'activate',
  triggered_by uuid REFERENCES auth.users(id),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  result_status text,
  result_message text
);

ALTER TABLE public.model_activation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit" ON public.model_activation_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Live Prop Readiness (per-game diagnostic flags)
CREATE TABLE public.live_prop_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  game_status_synced boolean DEFAULT false,
  provider_game_mapped boolean DEFAULT false,
  roster_ready boolean DEFAULT false,
  lineups_ready boolean DEFAULT false,
  live_boxscore_ready boolean DEFAULT false,
  player_live_stats_ready boolean DEFAULT false,
  odds_ready boolean DEFAULT false,
  market_definitions_ready boolean DEFAULT false,
  active_model_ready boolean DEFAULT false,
  scorecard_ready boolean DEFAULT false,
  live_prop_rows_generated boolean DEFAULT false,
  failure_stage text,
  failure_detail text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id)
);

ALTER TABLE public.live_prop_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage readiness" ON public.live_prop_readiness
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read readiness" ON public.live_prop_readiness
  FOR SELECT TO authenticated
  USING (true);
