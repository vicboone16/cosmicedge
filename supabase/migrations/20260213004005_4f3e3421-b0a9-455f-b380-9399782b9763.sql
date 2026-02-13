
-- Games table
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_abbr TEXT NOT NULL,
  away_abbr TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  venue TEXT,
  venue_lat DOUBLE PRECISION,
  venue_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Odds snapshots (line movement tracking)
CREATE TABLE public.odds_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  bookmaker TEXT NOT NULL,
  market_type TEXT NOT NULL, -- moneyline, spread, total, team_total
  home_price INTEGER,
  away_price INTEGER,
  line DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players table
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  team TEXT,
  league TEXT,
  position TEXT,
  birth_date DATE,
  birth_time TIME,
  birth_place TEXT,
  birth_lat DOUBLE PRECISION,
  birth_lng DOUBLE PRECISION,
  natal_data_quality TEXT DEFAULT 'C', -- A=verified time, B=unknown time, C=unknown date
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bets (user tracking)
CREATE TABLE public.bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  market_type TEXT NOT NULL,
  selection TEXT NOT NULL,
  line DOUBLE PRECISION,
  odds INTEGER NOT NULL,
  stake DOUBLE PRECISION,
  likelihood DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  volatility TEXT,
  recommendation TEXT,
  horary_lean TEXT,
  horary_strength DOUBLE PRECISION,
  transit_boost DOUBLE PRECISION,
  result TEXT, -- win, loss, push, pending
  payout DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Results / settlement
CREATE TABLE public.results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  bet_id UUID REFERENCES public.bets(id) ON DELETE SET NULL,
  actual_outcome TEXT,
  predicted_likelihood DOUBLE PRECISION,
  was_correct BOOLEAN,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intel notes (user context)
CREATE TABLE public.intel_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  tag TEXT NOT NULL, -- injury_rumor, minutes_restriction, personal_event, coach_quote
  content TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_notes ENABLE ROW LEVEL SECURITY;

-- Games & odds & players: publicly readable (reference data)
CREATE POLICY "Games are publicly readable" ON public.games FOR SELECT USING (true);
CREATE POLICY "Odds are publicly readable" ON public.odds_snapshots FOR SELECT USING (true);
CREATE POLICY "Players are publicly readable" ON public.players FOR SELECT USING (true);

-- Bets: user-scoped
CREATE POLICY "Users can view own bets" ON public.bets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own bets" ON public.bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bets" ON public.bets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bets" ON public.bets FOR DELETE USING (auth.uid() = user_id);

-- Results: readable by bet owner
CREATE POLICY "Users can view own results" ON public.results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.bets WHERE bets.id = results.bet_id AND bets.user_id = auth.uid())
  OR bet_id IS NULL
);

-- Intel notes: user-scoped
CREATE POLICY "Users can view own notes" ON public.intel_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own notes" ON public.intel_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.intel_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.intel_notes FOR DELETE USING (auth.uid() = user_id);

-- Admin insert policies for games/odds/players (via service role only, no user insert)
-- These will be populated by edge functions using the service role key

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bets_updated_at BEFORE UPDATE ON public.bets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_games_league ON public.games(league);
CREATE INDEX idx_games_start_time ON public.games(start_time);
CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_odds_game_id ON public.odds_snapshots(game_id);
CREATE INDEX idx_odds_captured_at ON public.odds_snapshots(captured_at);
CREATE INDEX idx_bets_user_id ON public.bets(user_id);
CREATE INDEX idx_bets_game_id ON public.bets(game_id);
CREATE INDEX idx_intel_notes_user_id ON public.intel_notes(user_id);
CREATE INDEX idx_intel_notes_game_id ON public.intel_notes(game_id);
