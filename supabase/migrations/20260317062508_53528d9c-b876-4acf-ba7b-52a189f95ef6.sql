-- Add unique constraint to nebula_prop_predictions for idempotent upserts
-- First, deduplicate existing rows: keep latest per (game_id, player_id, prop_type)
DELETE FROM public.nebula_prop_predictions a
USING public.nebula_prop_predictions b
WHERE a.game_id = b.game_id
  AND a.player_id = b.player_id
  AND a.prop_type = b.prop_type
  AND a.id < b.id;

-- Now add the unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'nebula_prop_predictions_game_player_prop_uq'
  ) THEN
    ALTER TABLE public.nebula_prop_predictions 
      ADD CONSTRAINT nebula_prop_predictions_game_player_prop_uq 
      UNIQUE (game_id, player_id, prop_type);
  END IF;
END $$;