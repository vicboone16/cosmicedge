
-- Add NFL-specific columns to player_game_stats (all nullable so existing NBA data is unaffected)
ALTER TABLE public.player_game_stats
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS targets integer,
  ADD COLUMN IF NOT EXISTS receiving_yards integer,
  ADD COLUMN IF NOT EXISTS receiving_touchdowns integer,
  ADD COLUMN IF NOT EXISTS passing_attempts integer,
  ADD COLUMN IF NOT EXISTS completions integer,
  ADD COLUMN IF NOT EXISTS passing_yards integer,
  ADD COLUMN IF NOT EXISTS passing_touchdowns integer,
  ADD COLUMN IF NOT EXISTS rushing_attempts integer,
  ADD COLUMN IF NOT EXISTS rushing_yards integer,
  ADD COLUMN IF NOT EXISTS rushing_touchdowns integer;
