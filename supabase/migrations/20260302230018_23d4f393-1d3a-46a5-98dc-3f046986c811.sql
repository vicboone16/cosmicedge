
-- Add clock_seconds_remaining and possession columns to game_state_snapshots
ALTER TABLE public.game_state_snapshots
  ADD COLUMN IF NOT EXISTS clock_seconds_remaining integer,
  ADD COLUMN IF NOT EXISTS possession text;

-- Create compute_live_wp() function implementing logistic ln-time model
-- z = β1 · (sd/σ) · ln((T+1)/(t+1)) + β3 · pos · √(t/T) + β4 · √(t/T)
-- where sd = score_diff, σ = league scoring variance, T = total game seconds, t = elapsed
CREATE OR REPLACE FUNCTION public.compute_live_wp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game_key uuid;
  v_sport text;
  v_home_score int;
  v_away_score int;
  v_sd int;           -- score diff (home - away)
  v_quarter int;
  v_clock_sec int;    -- seconds remaining in current period
  v_total_sec int;    -- total game seconds
  v_elapsed numeric;
  v_remaining numeric;
  
  -- Model constants (NBA defaults, extensible)
  v_beta1 numeric := 1.6;
  v_beta3 numeric := 0.3;   -- possession bonus
  v_beta4 numeric := 0.15;  -- time decay bonus
  v_sigma numeric := 12.5;  -- NBA scoring std dev
  v_T numeric;               -- total game time in seconds
  v_period_count int := 4;   -- number of regulation periods
  
  -- Computed values
  v_z numeric;
  v_wp_home numeric;
  v_pos_val numeric;
  v_fair_ml_home int;
  v_fair_ml_away int;
  v_poss_remaining numeric;
  
  -- Scope-specific
  v_scope text;
  v_scope_sigma_scale numeric;
  v_scope_T numeric;
  v_scope_elapsed numeric;
  v_scope_sd int;
  v_scope_home_score int;
  v_scope_away_score int;
BEGIN
  v_game_key := NEW.game_id;
  v_home_score := COALESCE(NEW.home_score, 0);
  v_away_score := COALESCE(NEW.away_score, 0);
  v_sd := v_home_score - v_away_score;
  v_quarter := COALESCE(NULLIF(NEW.quarter, '')::int, 1);
  v_clock_sec := COALESCE(NEW.clock_seconds_remaining, 720); -- default 12 min
  
  -- Determine sport from game
  SELECT league INTO v_sport FROM games WHERE id = v_game_key;
  v_sport := COALESCE(v_sport, 'NBA');
  
  -- Set sport-specific constants
  CASE v_sport
    WHEN 'NBA' THEN
      v_T := 2880; v_sigma := 12.5; v_period_count := 4;
    WHEN 'NFL' THEN
      v_T := 3600; v_sigma := 14.0; v_period_count := 4;
    WHEN 'NHL' THEN
      v_T := 3600; v_sigma := 2.5; v_period_count := 3;
    WHEN 'MLB' THEN
      v_T := 54; v_sigma := 4.0; v_period_count := 9; -- 54 outs
    ELSE
      v_T := 2880; v_sigma := 12.5; v_period_count := 4;
  END CASE;
  
  -- Possession value: +1 if home has ball, -1 if away, 0 if unknown
  v_pos_val := CASE NEW.possession
    WHEN 'home' THEN 1.0
    WHEN 'away' THEN -1.0
    ELSE 0.0
  END;
  
  -- Calculate full-game elapsed seconds
  -- quarter is 1-based, clock_sec is remaining in current period
  v_elapsed := ((v_quarter - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
  v_remaining := GREATEST(v_T - v_elapsed, 1);
  
  -- Handle overtime: cap elapsed at T
  IF v_elapsed > v_T THEN
    v_elapsed := v_T;
    v_remaining := 1;
  END IF;
  
  v_poss_remaining := CASE v_sport
    WHEN 'NBA' THEN v_remaining / 24.0  -- ~24 sec per possession
    WHEN 'NFL' THEN v_remaining / 40.0
    ELSE v_remaining / 30.0
  END;
  
  -- ── FULL GAME scope ──
  v_scope := 'full';
  v_scope_sigma_scale := 1.0;
  v_scope_T := v_T;
  v_scope_elapsed := v_elapsed;
  v_scope_sd := v_sd;
  
  v_z := v_beta1 * (v_scope_sd / (v_sigma * v_scope_sigma_scale))
         * ln((v_scope_T + 1) / (GREATEST(v_scope_T - v_scope_elapsed, 1) + 1))
       + v_beta3 * v_pos_val * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1))
       + v_beta4 * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1));
  v_wp_home := 1.0 / (1.0 + exp(-v_z));
  v_wp_home := GREATEST(0.001, LEAST(0.999, v_wp_home));
  
  -- Fair ML: convert probability to American odds
  IF v_wp_home >= 0.5 THEN
    v_fair_ml_home := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
    v_fair_ml_away := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
  ELSE
    v_fair_ml_home := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
    v_fair_ml_away := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
  END IF;
  
  INSERT INTO game_live_wp (game_key, scope, wp_home, fair_ml_home, fair_ml_away,
    possessions_remaining, score_diff, time_remaining_sec, quarter, sport, computed_at)
  VALUES (v_game_key, v_scope, ROUND(v_wp_home, 4), v_fair_ml_home, v_fair_ml_away,
    ROUND(v_poss_remaining, 1), v_scope_sd, v_remaining::int, v_quarter, v_sport, now())
  ON CONFLICT (game_key, scope) DO UPDATE SET
    wp_home = EXCLUDED.wp_home,
    fair_ml_home = EXCLUDED.fair_ml_home,
    fair_ml_away = EXCLUDED.fair_ml_away,
    possessions_remaining = EXCLUDED.possessions_remaining,
    score_diff = EXCLUDED.score_diff,
    time_remaining_sec = EXCLUDED.time_remaining_sec,
    quarter = EXCLUDED.quarter,
    computed_at = EXCLUDED.computed_at,
    updated_at = now();
  
  -- ── HALF scope ──
  v_scope := 'half';
  v_scope_sigma_scale := 1.0 / sqrt(2.0);
  v_scope_T := v_T / 2.0;
  -- If in first half
  IF v_quarter <= (v_period_count / 2) THEN
    v_scope_elapsed := ((v_quarter - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
    v_scope_sd := v_sd;
  ELSE
    -- Second half: use second half scores only (approximate from quarter scores)
    v_scope_elapsed := ((v_quarter - (v_period_count / 2) - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
    v_scope_sd := v_sd; -- approximate: use full diff
  END IF;
  v_scope_elapsed := GREATEST(0, LEAST(v_scope_elapsed, v_scope_T));
  
  v_z := v_beta1 * (v_scope_sd / (v_sigma * v_scope_sigma_scale))
         * ln((v_scope_T + 1) / (GREATEST(v_scope_T - v_scope_elapsed, 1) + 1))
       + v_beta3 * v_pos_val * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1))
       + v_beta4 * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1));
  v_wp_home := 1.0 / (1.0 + exp(-v_z));
  v_wp_home := GREATEST(0.001, LEAST(0.999, v_wp_home));
  
  IF v_wp_home >= 0.5 THEN
    v_fair_ml_home := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
    v_fair_ml_away := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
  ELSE
    v_fair_ml_home := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
    v_fair_ml_away := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
  END IF;
  
  INSERT INTO game_live_wp (game_key, scope, wp_home, fair_ml_home, fair_ml_away,
    possessions_remaining, score_diff, time_remaining_sec, quarter, sport, computed_at)
  VALUES (v_game_key, v_scope, ROUND(v_wp_home, 4), v_fair_ml_home, v_fair_ml_away,
    ROUND(v_poss_remaining / 2.0, 1), v_scope_sd, GREATEST(v_scope_T - v_scope_elapsed, 0)::int, v_quarter, v_sport, now())
  ON CONFLICT (game_key, scope) DO UPDATE SET
    wp_home = EXCLUDED.wp_home,
    fair_ml_home = EXCLUDED.fair_ml_home,
    fair_ml_away = EXCLUDED.fair_ml_away,
    possessions_remaining = EXCLUDED.possessions_remaining,
    score_diff = EXCLUDED.score_diff,
    time_remaining_sec = EXCLUDED.time_remaining_sec,
    quarter = EXCLUDED.quarter,
    computed_at = EXCLUDED.computed_at,
    updated_at = now();
  
  -- ── QUARTER scope ──
  v_scope := 'quarter';
  v_scope_sigma_scale := 1.0 / sqrt(v_period_count::numeric);
  v_scope_T := v_T / v_period_count;
  v_scope_elapsed := (v_T / v_period_count) - v_clock_sec;
  v_scope_elapsed := GREATEST(0, LEAST(v_scope_elapsed, v_scope_T));
  v_scope_sd := v_sd; -- approximate: use full diff for current quarter
  
  v_z := v_beta1 * (v_scope_sd / (v_sigma * v_scope_sigma_scale))
         * ln((v_scope_T + 1) / (GREATEST(v_scope_T - v_scope_elapsed, 1) + 1))
       + v_beta3 * v_pos_val * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1))
       + v_beta4 * sqrt(v_scope_elapsed / GREATEST(v_scope_T, 1));
  v_wp_home := 1.0 / (1.0 + exp(-v_z));
  v_wp_home := GREATEST(0.001, LEAST(0.999, v_wp_home));
  
  IF v_wp_home >= 0.5 THEN
    v_fair_ml_home := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
    v_fair_ml_away := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
  ELSE
    v_fair_ml_home := ROUND((1.0 - v_wp_home) / v_wp_home * 100);
    v_fair_ml_away := -ROUND(v_wp_home / (1.0 - v_wp_home) * 100);
  END IF;
  
  INSERT INTO game_live_wp (game_key, scope, wp_home, fair_ml_home, fair_ml_away,
    possessions_remaining, score_diff, time_remaining_sec, quarter, sport, computed_at)
  VALUES (v_game_key, v_scope, ROUND(v_wp_home, 4), v_fair_ml_home, v_fair_ml_away,
    ROUND(v_poss_remaining / v_period_count, 1), v_scope_sd, GREATEST(v_scope_T - v_scope_elapsed, 0)::int, v_quarter, v_sport, now())
  ON CONFLICT (game_key, scope) DO UPDATE SET
    wp_home = EXCLUDED.wp_home,
    fair_ml_home = EXCLUDED.fair_ml_home,
    fair_ml_away = EXCLUDED.fair_ml_away,
    possessions_remaining = EXCLUDED.possessions_remaining,
    score_diff = EXCLUDED.score_diff,
    time_remaining_sec = EXCLUDED.time_remaining_sec,
    quarter = EXCLUDED.quarter,
    computed_at = EXCLUDED.computed_at,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Add unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_live_wp_game_key_scope_key'
  ) THEN
    ALTER TABLE public.game_live_wp ADD CONSTRAINT game_live_wp_game_key_scope_key UNIQUE (game_key, scope);
  END IF;
END $$;

-- Create trigger on game_state_snapshots
DROP TRIGGER IF EXISTS trg_compute_live_wp ON public.game_state_snapshots;
CREATE TRIGGER trg_compute_live_wp
  AFTER INSERT ON public.game_state_snapshots
  FOR EACH ROW
  WHEN (NEW.status IN ('live', 'in_progress'))
  EXECUTE FUNCTION public.compute_live_wp();
