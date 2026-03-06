-- Fix TT action RPCs to use current schema (next_server + tt_points/tt_serve_stats)

CREATE OR REPLACE FUNCTION public.tt_start_match(
  p_player_a text,
  p_player_b text,
  p_first_server text DEFAULT 'A'::text,
  p_ps numeric DEFAULT 0.56,
  p_pr numeric DEFAULT 0.52
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_first_server text;
  v_ps numeric;
  v_pr numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_first_server := CASE WHEN upper(coalesce(p_first_server, 'A')) = 'B' THEN 'B' ELSE 'A' END;
  v_ps := coalesce(p_ps, 0.56);
  v_pr := coalesce(p_pr, 0.52);

  INSERT INTO public.tt_matches (
    player_a,
    player_b,
    first_server,
    next_server,
    serves_left,
    score_a,
    score_b,
    status,
    updated_at
  )
  VALUES (
    coalesce(nullif(trim(p_player_a), ''), 'Player A'),
    coalesce(nullif(trim(p_player_b), ''), 'Player B'),
    v_first_server,
    v_first_server,
    2,
    0,
    0,
    'live',
    now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.tt_serve_stats (
    match_id,
    a_serve_points,
    a_serve_wins_by_a,
    b_serve_points,
    b_serve_wins_by_a,
    prior_ps,
    prior_pr,
    prior_strength,
    updated_at
  )
  VALUES (
    v_id,
    0,
    0,
    0,
    0,
    v_ps,
    v_pr,
    10,
    now()
  )
  ON CONFLICT (match_id) DO UPDATE SET
    a_serve_points = 0,
    a_serve_wins_by_a = 0,
    b_serve_points = 0,
    b_serve_wins_by_a = 0,
    prior_ps = EXCLUDED.prior_ps,
    prior_pr = EXCLUDED.prior_pr,
    prior_strength = EXCLUDED.prior_strength,
    updated_at = now();

  PERFORM public.tt_recompute_metrics(v_id);

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tt_log_point(
  p_match_id uuid,
  p_winner text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m public.tt_matches%ROWTYPE;
  v_winner text;
  v_next_a int;
  v_next_b int;
  v_next_server text;
  v_next_serves int;
  v_point_number int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO m
  FROM public.tt_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF coalesce(m.status, 'live') <> 'live' THEN
    RAISE EXCEPTION 'Match not live';
  END IF;

  v_winner := upper(coalesce(p_winner, ''));
  IF v_winner NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'Winner must be A or B';
  END IF;

  v_next_a := m.score_a + CASE WHEN v_winner = 'A' THEN 1 ELSE 0 END;
  v_next_b := m.score_b + CASE WHEN v_winner = 'B' THEN 1 ELSE 0 END;

  SELECT t.next_server, t.serves_left
  INTO v_next_server, v_next_serves
  FROM public.tt_advance_serve_state(v_next_a, v_next_b, m.next_server, m.serves_left) t;

  SELECT coalesce(max(point_number), 0) + 1
  INTO v_point_number
  FROM public.tt_points
  WHERE match_id = p_match_id;

  INSERT INTO public.tt_points (match_id, point_number, winner, server)
  VALUES (p_match_id, v_point_number, v_winner, m.next_server);

  INSERT INTO public.tt_point_log (match_id, winner, score_a_after, score_b_after, server_after, serves_left_after)
  VALUES (p_match_id, v_winner, v_next_a, v_next_b, v_next_server, v_next_serves);

  UPDATE public.tt_matches
  SET
    score_a = v_next_a,
    score_b = v_next_b,
    next_server = v_next_server,
    serves_left = v_next_serves,
    status = CASE
      WHEN (v_next_a >= 11 AND v_next_a - v_next_b >= 2)
        OR (v_next_b >= 11 AND v_next_b - v_next_a >= 2)
      THEN 'ended'
      ELSE 'live'
    END,
    updated_at = now()
  WHERE id = p_match_id;

  PERFORM public.tt_recompute_metrics(p_match_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tt_undo_last_point(
  p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_point_id bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  WITH last_point AS (
    SELECT id
    FROM public.tt_points
    WHERE match_id = p_match_id
    ORDER BY point_number DESC, id DESC
    LIMIT 1
  )
  DELETE FROM public.tt_points p
  USING last_point lp
  WHERE p.id = lp.id
  RETURNING p.id INTO v_deleted_point_id;

  IF v_deleted_point_id IS NULL THEN
    RAISE EXCEPTION 'No points to undo';
  END IF;

  DELETE FROM public.tt_point_log l
  WHERE l.id = (
    SELECT id
    FROM public.tt_point_log
    WHERE match_id = p_match_id
    ORDER BY id DESC
    LIMIT 1
  );

  PERFORM public.tt_rebuild_state_from_points(p_match_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tt_reset_match(
  p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tt_matches WHERE id = p_match_id
  ) THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  DELETE FROM public.tt_points WHERE match_id = p_match_id;
  DELETE FROM public.tt_point_log WHERE match_id = p_match_id;

  UPDATE public.tt_matches
  SET
    score_a = 0,
    score_b = 0,
    next_server = first_server,
    serves_left = 2,
    status = 'live',
    updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.tt_serve_stats (
    match_id,
    a_serve_points,
    a_serve_wins_by_a,
    b_serve_points,
    b_serve_wins_by_a,
    prior_ps,
    prior_pr,
    prior_strength,
    updated_at
  )
  VALUES (
    p_match_id,
    0,
    0,
    0,
    0,
    0.56,
    0.52,
    10,
    now()
  )
  ON CONFLICT (match_id) DO UPDATE SET
    a_serve_points = 0,
    a_serve_wins_by_a = 0,
    b_serve_points = 0,
    b_serve_wins_by_a = 0,
    updated_at = now();

  PERFORM public.tt_recompute_metrics(p_match_id);
END;
$function$;