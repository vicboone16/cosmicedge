
-- ============================================
-- 1) Add missing columns to existing bets table (non-breaking, additive only)
-- ============================================
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS sport text DEFAULT 'NBA';
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS season integer;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS game_date date;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS home_team text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS away_team text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS side text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS book text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS stake_amount numeric;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS stake_unit text DEFAULT 'units';
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS to_win_amount numeric;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS result_notes text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS edge_score integer DEFAULT 50;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS edge_tier text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS why_summary text;
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS external_game_id integer;

-- ============================================
-- 2) Create live_board_items join table
-- ============================================
CREATE TABLE public.live_board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bet_id uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_pinned boolean DEFAULT false,
  order_index integer DEFAULT 0,
  UNIQUE(user_id, bet_id)
);

ALTER TABLE public.live_board_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own live board items"
  ON public.live_board_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own live board items"
  ON public.live_board_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own live board items"
  ON public.live_board_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own live board items"
  ON public.live_board_items FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3) Create game_state_snapshots table
-- ============================================
CREATE TABLE public.game_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  status text,
  home_score integer,
  away_score integer,
  quarter text,
  clock text
);

ALTER TABLE public.game_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game state snapshots are publicly readable"
  ON public.game_state_snapshots FOR SELECT
  USING (true);
