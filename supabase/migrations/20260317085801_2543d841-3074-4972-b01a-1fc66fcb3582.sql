-- User betting profiles for the Personal Betting Style Engine
CREATE TABLE public.user_betting_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  -- Risk & Style
  risk_tolerance text DEFAULT 'moderate', -- conservative, moderate, aggressive
  betting_archetype text DEFAULT 'selective_hunter',
  -- Preferences
  preferred_bet_types text[] DEFAULT '{}',
  preferred_market_types text[] DEFAULT '{}',
  preferred_slip_size int DEFAULT 3,
  avg_live_bet_frequency numeric DEFAULT 0,
  avg_pregame_bet_frequency numeric DEFAULT 0,
  same_game_stack_tendency numeric DEFAULT 0, -- 0-1
  correlation_tolerance numeric DEFAULT 0.5, -- 0-1
  -- Behavioral scores
  tilt_risk_score numeric DEFAULT 0, -- 0-100
  hedging_tendency numeric DEFAULT 0, -- 0-1
  high_volatility_tendency numeric DEFAULT 0, -- 0-1
  over_under_bias numeric DEFAULT 0, -- -1 (under) to +1 (over)
  live_vs_pregame_ratio numeric DEFAULT 0.5, -- 0=all pregame, 1=all live
  -- Performance zones
  best_performing_markets text[] DEFAULT '{}',
  worst_performing_markets text[] DEFAULT '{}',
  strongest_edge_zones text[] DEFAULT '{}',
  weakest_leak_zones text[] DEFAULT '{}',
  strongest_stat_types text[] DEFAULT '{}',
  -- Coaching
  recurring_mistakes text[] DEFAULT '{}',
  overexposure_habits text[] DEFAULT '{}',
  strongest_slip_structures text[] DEFAULT '{}',
  -- Astra personalization
  astro_weight_preference numeric DEFAULT 0.5, -- 0=ignore astro, 1=heavy astro
  favorite_astra_tone text DEFAULT 'balanced', -- sharp, balanced, cosmic
  -- Meta
  profile_generated_at timestamptz,
  games_analyzed int DEFAULT 0,
  bets_analyzed int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_betting_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users read own betting profile"
  ON public.user_betting_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users update own betting profile"
  ON public.user_betting_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users insert own betting profile"
  ON public.user_betting_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role can do anything (for edge functions)
CREATE POLICY "Service role full access betting profiles"
  ON public.user_betting_profiles
  FOR ALL TO service_role
  USING (true);
