
-- ══════════════════════════════════════════════════════════════
-- Cosmic Archetype Engine — Phase 2 Tables
-- ══════════════════════════════════════════════════════════════

-- 1. cosmic_archetype_state: universal archetype assignments for any entity
CREATE TABLE IF NOT EXISTS public.cosmic_archetype_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('player','game','bet','slip')),
  entity_id text NOT NULL,
  primary_archetype text NOT NULL,
  secondary_archetype text,
  archetype_family text,
  archetype_score numeric(5,2),
  archetype_confidence numeric(5,4),
  archetype_reason_primary text,
  archetype_reason_secondary text,
  volatility_signature text,
  pressure_signature text,
  momentum_signature text,
  timing_signature text,
  shadow_signature text,
  math_archetype_relation text CHECK (math_archetype_relation IN (
    'math_confirms_archetype','math_conflicts_archetype',
    'archetype_supportive','archetype_warning','archetype_neutral'
  )),
  recommended_interpretation text,
  is_live boolean NOT NULL DEFAULT false,
  game_id uuid REFERENCES public.games(id),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cas_entity ON public.cosmic_archetype_state (entity_type, entity_id);
CREATE INDEX idx_cas_game ON public.cosmic_archetype_state (game_id) WHERE game_id IS NOT NULL;
CREATE INDEX idx_cas_user ON public.cosmic_archetype_state (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_cas_archetype ON public.cosmic_archetype_state (primary_archetype);

ALTER TABLE public.cosmic_archetype_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read archetype state"
  ON public.cosmic_archetype_state FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage archetype state"
  ON public.cosmic_archetype_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. player_archetype_profile: multi-dimensional archetype profile per player
CREATE TABLE IF NOT EXISTS public.player_archetype_profile (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  baseline_archetype text,
  live_archetype text,
  pressure_archetype text,
  closing_archetype text,
  volatility_archetype text,
  role_archetype text,
  surge_archetype text,
  shadow_archetype text,
  archetype_stability_score numeric(5,2),
  baseline_score numeric(5,2),
  live_score numeric(5,2),
  baseline_confidence numeric(5,4),
  live_confidence numeric(5,4),
  archetype_family text,
  recommended_interpretation text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_archetype_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read player archetype profiles"
  ON public.player_archetype_profile FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage player archetype profiles"
  ON public.player_archetype_profile FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. game_archetype_profile: multi-dimensional archetype profile per game
CREATE TABLE IF NOT EXISTS public.game_archetype_profile (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  baseline_game_archetype text,
  live_game_archetype text,
  tempo_archetype text,
  pressure_archetype text,
  volatility_archetype text,
  ending_archetype text,
  risk_archetype text,
  archetype_score numeric(5,2),
  archetype_confidence numeric(5,4),
  archetype_family text,
  recommended_interpretation text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_archetype_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game archetype profiles"
  ON public.game_archetype_profile FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage game archetype profiles"
  ON public.game_archetype_profile FOR ALL
  USING (true)
  WITH CHECK (true);
