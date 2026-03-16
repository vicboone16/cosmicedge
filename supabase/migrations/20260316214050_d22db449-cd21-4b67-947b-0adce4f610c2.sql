
CREATE OR REPLACE FUNCTION public.refresh_live_game_derived_metrics(p_game_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_home text; v_away text; v_period int; v_clock int;
  v_last_type text; v_last_subtype text; v_last_team text; v_poss_team text;
  v_run_home int := 0; v_run_away int := 0;
  v_lhsc int; v_lhsp int; v_lasc int; v_lasp int;
  v_drought_h int; v_drought_a int;
  v_fg_dh int; v_fg_da int; v_fhc int; v_fhp int; v_fac int; v_fap int;
  v_elapsed numeric := 0; v_poss_ends int := 0; v_pace numeric;
  v_conf numeric := 0.35; v_mom_team text; v_mom numeric := 0;
  v_ep_h int := 0; v_ep_a int := 0; v_ep_hn int := 0; v_ep_an int := 0;
  v_orh int := 0; v_ora int := 0; v_or_team text;
  v_foul_h int := 0; v_foul_a int := 0;
  v_bonus_h bool := false; v_bonus_a bool := false; v_bd_team text;
BEGIN
  SELECT home_team_id, away_team_id, period_number, clock_seconds_remaining,
         last_event_type, last_event_subtype, last_event_team_id, possession_team_id
  INTO v_home, v_away, v_period, v_clock,
       v_last_type, v_last_subtype, v_last_team, v_poss_team
  FROM public.live_game_visual_state WHERE game_id = p_game_id;
  IF v_home IS NULL AND v_away IS NULL THEN RETURN; END IF;

  -- 1) RUN
  SELECT COALESCE(SUM(CASE WHEN team_id=v_home THEN points_scored ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN team_id=v_away THEN points_scored ELSE 0 END),0)
  INTO v_run_home, v_run_away
  FROM public.v_pbp_scoring_events
  WHERE game_id=p_game_id AND period_number=v_period
    AND clock_seconds_remaining BETWEEN GREATEST(v_clock,0) AND LEAST(COALESCE(v_clock,0)+180,720);
  IF COALESCE(v_run_home,0)=0 AND COALESCE(v_run_away,0)=0 THEN
    SELECT COALESCE(SUM(CASE WHEN team_id=v_home THEN points_scored ELSE 0 END),0),
           COALESCE(SUM(CASE WHEN team_id=v_away THEN points_scored ELSE 0 END),0)
    INTO v_run_home, v_run_away
    FROM (SELECT * FROM public.v_pbp_scoring_events WHERE game_id=p_game_id
          ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 8) x;
  END IF;

  -- 2) SCORING DROUGHT
  SELECT clock_seconds_remaining, period_number INTO v_lhsc, v_lhsp
  FROM public.v_pbp_scoring_events WHERE game_id=p_game_id AND team_id=v_home
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  SELECT clock_seconds_remaining, period_number INTO v_lasc, v_lasp
  FROM public.v_pbp_scoring_events WHERE game_id=p_game_id AND team_id=v_away
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  v_drought_h := public.calc_drought_seconds(v_lhsp, v_lhsc, v_period, v_clock);
  v_drought_a := public.calc_drought_seconds(v_lasp, v_lasc, v_period, v_clock);

  -- 2b) FG DROUGHT
  SELECT clock_seconds_remaining, period_number INTO v_fhc, v_fhp
  FROM public.v_pbp_fg_scoring_events WHERE game_id=p_game_id AND team_id=v_home
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  SELECT clock_seconds_remaining, period_number INTO v_fac, v_fap
  FROM public.v_pbp_fg_scoring_events WHERE game_id=p_game_id AND team_id=v_away
  ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST, created_at DESC LIMIT 1;
  v_fg_dh := public.calc_drought_seconds(v_fhp, v_fhc, v_period, v_clock);
  v_fg_da := public.calc_drought_seconds(v_fap, v_fac, v_period, v_clock);

  -- 3) PACE
  IF v_period IS NOT NULL AND v_clock IS NOT NULL THEN
    v_elapsed := public.get_elapsed_game_seconds(v_period, v_clock);
  END IF;
  SELECT COALESCE(SUM(possession_end_flag),0) INTO v_poss_ends
  FROM public.v_pbp_possession_end_events WHERE game_id=p_game_id;
  IF v_elapsed > 0 THEN v_pace := ROUND((v_poss_ends::numeric/(v_elapsed/60.0))*48.0,1); END IF;

  -- 4) POSSESSION CONFIDENCE
  v_conf := CASE
    WHEN v_last_type IN ('rebound_defensive','turnover','steal','made_shot','jump_ball','foul_offensive') THEN 0.92
    WHEN v_last_type='rebound_offensive' THEN 0.88
    WHEN v_last_type IN ('timeout','substitution') AND v_poss_team IS NOT NULL THEN 0.76
    WHEN v_last_type IN ('foul_shooting','foul_personal','free_throw_made','free_throw_missed') THEN 0.55
    WHEN v_last_type='unknown' THEN 0.25 ELSE 0.40 END;

  -- 5) MOMENTUM
  v_mom := COALESCE(v_run_home,0) - COALESCE(v_run_away,0);
  IF v_last_type IN ('made_shot','free_throw_made') THEN
    IF v_last_team=v_home THEN v_mom:=v_mom+0.75; ELSIF v_last_team=v_away THEN v_mom:=v_mom-0.75; END IF;
  END IF;
  IF v_poss_team=v_home THEN v_mom:=v_mom+0.25; ELSIF v_poss_team=v_away THEN v_mom:=v_mom-0.25; END IF;
  v_mom_team := CASE WHEN v_mom>0 THEN v_home WHEN v_mom<0 THEN v_away ELSE NULL END;

  -- 6) EMPTY POSSESSIONS
  SELECT COALESCE(SUM(CASE WHEN team_id=v_home THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN team_id=v_away THEN 1 ELSE 0 END),0)
  INTO v_ep_h, v_ep_a
  FROM public.v_pbp_possession_end_events
  WHERE game_id=p_game_id AND possession_end_flag=1 AND event_type!='made_shot';

  SELECT COALESCE(SUM(CASE WHEN event_type!='made_shot' THEN 1 ELSE 0 END),0) INTO v_ep_hn
  FROM (SELECT event_type FROM public.v_pbp_possession_end_events
        WHERE game_id=p_game_id AND team_id=v_home AND possession_end_flag=1
        ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST LIMIT 5) x;
  SELECT COALESCE(SUM(CASE WHEN event_type!='made_shot' THEN 1 ELSE 0 END),0) INTO v_ep_an
  FROM (SELECT event_type FROM public.v_pbp_possession_end_events
        WHERE game_id=p_game_id AND team_id=v_away AND possession_end_flag=1
        ORDER BY period_number DESC, sequence_number DESC NULLS LAST, event_index DESC NULLS LAST LIMIT 5) x;

  -- 7) OREB PRESSURE
  SELECT COALESCE(SUM(CASE WHEN team_id=v_home THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN team_id=v_away THEN 1 ELSE 0 END),0)
  INTO v_orh, v_ora
  FROM public.normalized_pbp_events
  WHERE game_id=p_game_id AND event_type='rebound_offensive' AND period_number=v_period;
  IF v_orh>=3 AND v_orh>v_ora THEN v_or_team:=v_home;
  ELSIF v_ora>=3 AND v_ora>v_orh THEN v_or_team:=v_away;
  ELSE v_or_team:=NULL; END IF;

  -- 8) FOULS & BONUS
  SELECT COALESCE(SUM(CASE WHEN team_id=v_home THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN team_id=v_away THEN 1 ELSE 0 END),0)
  INTO v_foul_h, v_foul_a
  FROM public.normalized_pbp_events
  WHERE game_id=p_game_id AND period_number=v_period
    AND event_type IN ('foul_personal','foul_shooting','foul_offensive','foul_loose_ball','foul_technical');
  v_bonus_h := (v_foul_a >= 5); v_bonus_a := (v_foul_h >= 5);
  IF v_foul_h=4 AND NOT v_bonus_a THEN v_bd_team:=v_home;
  ELSIF v_foul_a=4 AND NOT v_bonus_h THEN v_bd_team:=v_away;
  ELSIF v_foul_h=4 AND v_foul_a=4 THEN v_bd_team:='both';
  ELSE v_bd_team:=NULL; END IF;

  UPDATE public.live_game_visual_state SET
    possession_confidence=v_conf, recent_run_home=COALESCE(v_run_home,0), recent_run_away=COALESCE(v_run_away,0),
    recent_scoring_drought_home_sec=v_drought_h, recent_scoring_drought_away_sec=v_drought_a,
    fg_drought_home_sec=v_fg_dh, fg_drought_away_sec=v_fg_da,
    pace_estimate=v_pace, momentum_team_id=v_mom_team, momentum_score=v_mom,
    empty_possessions_home=v_ep_h, empty_possessions_away=v_ep_a,
    empty_poss_home_last_n=v_ep_hn, empty_poss_away_last_n=v_ep_an,
    oreb_home_period=v_orh, oreb_away_period=v_ora, oreb_pressure_team_id=v_or_team,
    home_fouls_period=v_foul_h, away_fouls_period=v_foul_a,
    in_bonus_home=v_bonus_h, in_bonus_away=v_bonus_a, bonus_danger_team_id=v_bd_team,
    updated_at=now()
  WHERE game_id=p_game_id;
END;
$$;
