-- Add status column to players table (active, retired, archived)
ALTER TABLE public.players ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Index for fast filtering
CREATE INDEX idx_players_status ON public.players (status);
