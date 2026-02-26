-- Add edge_score_v20 to nebula_prop_predictions for EV-based EdgeScore
ALTER TABLE public.nebula_prop_predictions
  ADD COLUMN IF NOT EXISTS edge_score_v20 numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_tier text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS p_model numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS p_implied numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edge_raw numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pace_mu_adjust numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pace_sigma_adjust numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transit_boost_factor numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS volatility_shift numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_adjustment numeric DEFAULT NULL;

-- Also add to model_predictions for audit trail
ALTER TABLE public.model_predictions
  ADD COLUMN IF NOT EXISTS edge_score_v20 numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence_tier text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS p_model numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS p_implied numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edge_raw numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pace_mu_adjust numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pace_sigma_adjust numeric DEFAULT NULL;