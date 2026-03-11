
CREATE OR REPLACE FUNCTION public.refresh_game_live_wp(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_home_score int;
  v_away_score int;
  v_clock_sec numeric;
  v_possession text;
  v_quarter_txt text;
  v_sport text;
  v_sd numeric;
  v_quarter int;
  v_T numeric;
  v_period_count int;
  v_elapsed numeric;
  v_remaining numeric;
  v_pos_val numeric;
  v_poss_remaining numeric;
  v_sigma numeric;
  v_beta1 numeric := 1.6;
  v_beta3 numeric := 0.3;
  v_beta4 numeric := 0.15;
  v_z numeric;
  v_wp numeric;
  v_fair_ml_home int;
  v_fair_ml_away int;
  v_scope text;
  v_scope_T numeric;
  v_scope_elapsed numeric;
  v_scope_sigma numeric;
  v_time_ratio numeric;
BEGIN
  -- Get latest snapshot
  SELECT s.home_score, s.away_score, s.clock_seconds_remaining, s.possession, s.quarter
  INTO v_home_score, v_away_score, v_clock_sec, v_possession, v_quarter_txt
  FROM public.game_state_snapshots s
  WHERE s.game_id = p_game_id
  ORDER BY s.captured_at DESC
  LIMIT 1;

  IF v_home_score IS NULL AND v_away_score IS NULL THEN RETURN; END IF;

  SELECT league INTO v_sport FROM games WHERE id = p_game_id;
  v_sport := COALESCE(v_sport, 'NBA');

  v_sd := COALESCE(v_home_score, 0) - COALESCE(v_away_score, 0);
  v_quarter := COALESCE(NULLIF(v_quarter_txt, '')::int, 1);
  v_clock_sec := COALESCE(v_clock_sec, 720);

  CASE v_sport
    WHEN 'NBA' THEN v_T := 2880; v_sigma := 12.5; v_period_count := 4;
    WHEN 'NFL' THEN v_T := 3600; v_sigma := 14.0; v_period_count := 4;
    WHEN 'NHL' THEN v_T := 3600; v_sigma := 2.5;  v_period_count := 3;
    WHEN 'MLB' THEN v_T := 54;   v_sigma := 4.0;  v_period_count := 9;
    ELSE v_T := 2880; v_sigma := 12.5; v_period_count := 4;
  END CASE;

  v_pos_val := CASE v_possession
    WHEN 'home' THEN 1.0 WHEN 'away' THEN -1.0 ELSE 0.0
  END;

  v_elapsed := ((v_quarter - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
  v_elapsed := GREATEST(0, LEAST(v_elapsed, v_T));
  v_remaining := GREATEST(v_T - v_elapsed, 1);
  v_poss_remaining := CASE v_sport
    WHEN 'NBA' THEN v_remaining / 24.0
    WHEN 'NFL' THEN v_remaining / 40.0
    ELSE v_remaining / 30.0
  END;

  FOREACH v_scope IN ARRAY ARRAY['full', 'half', 'quarter'] LOOP
    CASE v_scope
      WHEN 'full' THEN
        v_scope_T := v_T; v_scope_elapsed := v_elapsed; v_scope_sigma := v_sigma;
      WHEN 'half' THEN
        v_scope_T := v_T / 2.0; v_scope_sigma := v_sigma / sqrt(2.0);
        IF v_quarter <= (v_period_count / 2) THEN
          v_scope_elapsed := ((v_quarter - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
        ELSE
          v_scope_elapsed := ((v_quarter - (v_period_count / 2) - 1) * (v_T / v_period_count)) + ((v_T / v_period_count) - v_clock_sec);
        END IF;
        v_scope_elapsed := GREATEST(0, LEAST(v_scope_elapsed, v_scope_T));
      WHEN 'quarter' THEN
        v_scope_T := v_T / v_period_count;
        v_scope_sigma := v_sigma / sqrt(v_period_count::numeric);
        v_scope_elapsed := (v_T / v_period_count) - v_clock_sec;
        v_scope_elapsed := GREATEST(0, LEAST(v_scope_elapsed, v_scope_T));
    END CASE;

    -- Safe time ratio (always 0..1)
    v_time_ratio := CASE WHEN v_scope_T > 0 THEN GREATEST(0, LEAST(v_scope_elapsed / v_scope_T, 1.0)) ELSE 0 END;

    v_z := v_beta1 * (v_sd / GREATEST(v_scope_sigma, 0.5))
           * ln((v_scope_T + 1) / (GREATEST(v_scope_T - v_scope_elapsed, 1) + 1))
         + v_beta3 * v_pos_val * sqrt(v_time_ratio)
         + v_beta4 * sqrt(v_time_ratio);
    v_wp := 1.0 / (1.0 + exp(-v_z));
    v_wp := GREATEST(0.001, LEAST(0.999, v_wp));

    IF v_wp >= 0.5 THEN
      v_fair_ml_home := -ROUND(v_wp / (1.0 - v_wp) * 100);
      v_fair_ml_away := ROUND((1.0 - v_wp) / v_wp * 100);
    ELSE
      v_fair_ml_home := ROUND((1.0 - v_wp) / v_wp * 100);
      v_fair_ml_away := -ROUND(v_wp / (1.0 - v_wp) * 100);
    END IF;

    INSERT INTO game_live_wp (game_key, scope, wp_home, fair_ml_home, fair_ml_away,
      possessions_remaining, score_diff, time_remaining_sec, quarter, sport, computed_at)
    VALUES (p_game_id, v_scope, ROUND(v_wp, 4), v_fair_ml_home, v_fair_ml_away,
      ROUND(v_poss_remaining / CASE v_scope WHEN 'half' THEN 2.0 WHEN 'quarter' THEN v_period_count::numeric ELSE 1.0 END, 1),
      v_sd, GREATEST(v_scope_T - v_scope_elapsed, 0)::int, v_quarter, v_sport, now())
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
  END LOOP;
END;
$$;
