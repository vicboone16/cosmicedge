
-- BoltOdds tables for server-side WebSocket integration

CREATE TABLE IF NOT EXISTS public.bolt_connection_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'disconnected',
  last_connected_at timestamptz,
  last_message_at timestamptz,
  last_error text,
  subscription_filters jsonb DEFAULT '{}'::jsonb,
  reconnect_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bolt_socket_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL,
  sport text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bolt_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolt_game_id text UNIQUE NOT NULL,
  sport text NOT NULL,
  league text,
  home_team text,
  away_team text,
  start_time timestamptz,
  status text DEFAULT 'active',
  raw_data jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bolt_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolt_game_id text NOT NULL REFERENCES bolt_games(bolt_game_id) ON DELETE CASCADE,
  market_key text NOT NULL,
  market_name text,
  market_type text,
  player_name text,
  is_suspended boolean DEFAULT false,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bolt_game_id, market_key)
);

CREATE TABLE IF NOT EXISTS public.bolt_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES bolt_markets(id) ON DELETE CASCADE,
  sportsbook text NOT NULL,
  outcome_name text,
  line numeric,
  odds numeric,
  american_odds int,
  is_suspended boolean DEFAULT false,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(market_id, sportsbook, outcome_name)
);

-- RLS
ALTER TABLE public.bolt_connection_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_socket_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_outcomes ENABLE ROW LEVEL SECURITY;

-- Admin read policies
CREATE POLICY "admin_read_bolt_connection" ON public.bolt_connection_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_read_bolt_logs" ON public.bolt_socket_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_read_bolt_games" ON public.bolt_games FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_read_bolt_markets" ON public.bolt_markets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_read_bolt_outcomes" ON public.bolt_outcomes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_bolt_logs_created ON public.bolt_socket_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bolt_games_sport ON public.bolt_games(sport, is_active);
CREATE INDEX IF NOT EXISTS idx_bolt_outcomes_book ON public.bolt_outcomes(sportsbook);
