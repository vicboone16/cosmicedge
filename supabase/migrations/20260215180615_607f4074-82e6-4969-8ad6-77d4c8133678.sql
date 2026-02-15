
-- Add a flexible JSONB column for storing all model weights in presets
ALTER TABLE public.backtest_presets ADD COLUMN IF NOT EXISTS weights_json JSONB DEFAULT '{}'::jsonb;
