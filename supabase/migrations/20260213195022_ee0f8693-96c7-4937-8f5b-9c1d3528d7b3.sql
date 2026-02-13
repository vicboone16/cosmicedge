-- Create tracked_props table for Select & Track feature
CREATE TABLE public.tracked_props (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_id UUID NOT NULL REFERENCES public.games(id),
  player_id UUID REFERENCES public.players(id),
  player_name TEXT NOT NULL,
  market_type TEXT NOT NULL,
  line NUMERIC NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('over', 'under')),
  odds INTEGER,
  book TEXT,
  stake NUMERIC,
  stake_unit TEXT DEFAULT 'units',
  notes TEXT,
  live_stat_value NUMERIC DEFAULT 0,
  progress NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pregame' CHECK (status IN ('pregame', 'live', 'hit', 'missed', 'push')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tracked_props ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own tracked props"
ON public.tracked_props FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tracked props"
ON public.tracked_props FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracked props"
ON public.tracked_props FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracked props"
ON public.tracked_props FOR DELETE
USING (auth.uid() = user_id);

-- Auto-update timestamp
CREATE TRIGGER update_tracked_props_updated_at
BEFORE UPDATE ON public.tracked_props
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
