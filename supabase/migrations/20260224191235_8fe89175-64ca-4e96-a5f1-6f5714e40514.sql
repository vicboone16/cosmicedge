-- Add result_direction to store actual outcome (over/under/push) when game finalizes
ALTER TABLE public.tracked_props ADD COLUMN IF NOT EXISTS result_direction text;

-- Comment for clarity
COMMENT ON COLUMN public.tracked_props.result_direction IS 'Actual outcome: over, under, or push. Set when game is finalized.';