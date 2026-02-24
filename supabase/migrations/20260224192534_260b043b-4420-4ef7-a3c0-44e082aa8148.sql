
CREATE OR REPLACE FUNCTION public.np_build_prop_features(
  p_player_id uuid,
  p_prop_type text,
  p_line numeric,
  p_game_id uuid DEFAULT NULL
)
RETURNS TABLE (
  hit_l5 numeric,
  hit_l10 numeric,
  hit_l20 numeric,
  std_dev_l10 numeric,
  coeff_of_var numeric,
  minutes_l5_avg numeric,
  minutes_season_avg numeric,
  delta_minutes numeric,
  role_up boolean,
  usage_proxy_l10 numeric,
  usage_proxy_season numeric,
  mu_rolling_l10 numeric,
  sigma_rolling_l10 numeric,
  mu_season numeric,
  sigma_season numeric,
  games_count int
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_line numeric := COALESCE(p_line, 0);
  o_hit_l5 numeric := 0;
  o_hit_l10 numeric := 0;
  o_hit_l20 numeric := 0;
  o_std_l10 numeric := 0;
  o_cv numeric := 0;
  o_min_l5 numeric := 0;
  o_min_season numeric := 0;
  o_delta_min numeric := 0;
  o_role_up boolean := false;
  o_usage_l10 numeric := 0;
  o_usage_season numeric := 0;
  o_mu_l10 numeric := 0;
  o_sigma_l10 numeric := 0;
  o_mu_season numeric := 0;
  o_sigma_season numeric := 0;
  o_games int := 0;
  r record;
  idx int := 0;
  hits_5 int := 0; cnt_5 int := 0;
  hits_10 int := 0; cnt_10 int := 0;
  hits_20 int := 0; cnt_20 int := 0;
  sum_stat numeric := 0;
  sum_stat_sq numeric := 0;
  sum_min numeric := 0;
  sum_fga numeric := 0;
  sum_stat_10 numeric := 0;
  sum_stat_sq_10 numeric := 0;
  sum_min_5 numeric := 0;
  sum_fga_10 numeric := 0;
  cnt_min int := 0;
  cnt_fga int := 0;
  v_val numeric;
BEGIN
  FOR r IN
    SELECT
      public.np_prop_stat_value(p_prop_type, pgs.points, pgs.rebounds, pgs.assists,
        pgs.steals, pgs.blocks, pgs.three_made, pgs.turnovers, pgs.fg_attempted) AS stat_val,
      pgs.minutes AS mins,
      pgs.fg_attempted AS fga
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    WHERE pgs.player_id = p_player_id
      AND pgs.period = 'full'
      AND g.status = 'final'
      AND (p_game_id IS NULL OR pgs.game_id != p_game_id)
    ORDER BY g.start_time DESC
    LIMIT 30
  LOOP
    idx := idx + 1;
    v_val := COALESCE(r.stat_val, 0);

    sum_stat := sum_stat + v_val;
    sum_stat_sq := sum_stat_sq + v_val * v_val;
    IF r.mins IS NOT NULL THEN
      sum_min := sum_min + r.mins;
      cnt_min := cnt_min + 1;
    END IF;
    IF r.fga IS NOT NULL THEN
      sum_fga := sum_fga + r.fga;
      cnt_fga := cnt_fga + 1;
    END IF;

    IF idx <= 5 THEN
      cnt_5 := cnt_5 + 1;
      IF v_val > v_line THEN hits_5 := hits_5 + 1; END IF;
      sum_min_5 := sum_min_5 + COALESCE(r.mins, 0);
    END IF;
    IF idx <= 10 THEN
      cnt_10 := cnt_10 + 1;
      IF v_val > v_line THEN hits_10 := hits_10 + 1; END IF;
      sum_stat_10 := sum_stat_10 + v_val;
      sum_stat_sq_10 := sum_stat_sq_10 + v_val * v_val;
      sum_fga_10 := sum_fga_10 + COALESCE(r.fga, 0);
    END IF;
    IF idx <= 20 THEN
      cnt_20 := cnt_20 + 1;
      IF v_val > v_line THEN hits_20 := hits_20 + 1; END IF;
    END IF;
  END LOOP;

  o_games := idx;

  IF cnt_5 > 0 THEN o_hit_l5 := round(hits_5::numeric / cnt_5, 4); END IF;
  IF cnt_10 > 0 THEN o_hit_l10 := round(hits_10::numeric / cnt_10, 4); END IF;
  IF cnt_20 > 0 THEN o_hit_l20 := round(hits_20::numeric / cnt_20, 4); END IF;

  IF cnt_10 > 1 THEN
    o_mu_l10 := round(sum_stat_10 / cnt_10, 4);
    o_std_l10 := round(sqrt(greatest((sum_stat_sq_10 / cnt_10) - (o_mu_l10 * o_mu_l10), 0)), 4);
    IF o_mu_l10 > 0 THEN o_cv := round(o_std_l10 / o_mu_l10, 4); END IF;
    o_sigma_l10 := greatest(o_std_l10, 0.5);
  ELSIF cnt_10 = 1 THEN
    o_mu_l10 := sum_stat_10;
    o_sigma_l10 := 2.0;
  END IF;

  IF o_games > 0 THEN
    o_mu_season := round(sum_stat / o_games, 4);
    IF o_games > 1 THEN
      o_sigma_season := round(sqrt(greatest((sum_stat_sq / o_games) - (o_mu_season * o_mu_season), 0)), 4);
    ELSE
      o_sigma_season := 2.0;
    END IF;
  END IF;

  IF cnt_5 > 0 THEN o_min_l5 := round(sum_min_5 / cnt_5, 2); END IF;
  IF cnt_min > 0 THEN o_min_season := round(sum_min / cnt_min, 2); END IF;
  o_delta_min := round(o_min_l5 - o_min_season, 2);
  o_role_up := (o_delta_min >= 3);

  IF cnt_10 > 0 THEN o_usage_l10 := round(sum_fga_10 / cnt_10, 2); END IF;
  IF cnt_fga > 0 THEN o_usage_season := round(sum_fga / cnt_fga, 2); END IF;

  RETURN QUERY SELECT
    o_hit_l5, o_hit_l10, o_hit_l20,
    o_std_l10, o_cv,
    o_min_l5, o_min_season, o_delta_min, o_role_up,
    o_usage_l10, o_usage_season,
    o_mu_l10, o_sigma_l10,
    o_mu_season, o_sigma_season,
    o_games;
END;
$$;
