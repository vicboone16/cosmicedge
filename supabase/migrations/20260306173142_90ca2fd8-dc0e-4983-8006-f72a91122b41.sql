
-- Fix tt_start_match: use next_server instead of current_server, write p_s/p_r to tt_serve_stats
CREATE OR REPLACE FUNCTION public.tt_start_match(
  p_player_a text, p_player_b text, p_first_server text DEFAULT 'A',
  p_ps numeric DEFAULT 0.56, p_pr numeric DEFAULT 0.52
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO tt_matches (player_a, player_b, first_server, next_server)
  VALUES (p_player_a, p_player_b, p_first_server, p_first_server)
  RETURNING id INTO v_id;
  INSERT INTO tt_serve_stats (match_id, prior_ps, prior_pr)
  VALUES (v_id, p_ps, p_pr)
  ON CONFLICT (match_id) DO UPDATE SET prior_ps = p_ps, prior_pr = p_pr, updated_at = now();
  RETURN v_id;
END; $function$;

-- Fix tt_log_point: use next_server instead of current_server
CREATE OR REPLACE FUNCTION public.tt_log_point(p_match_id uuid, p_winner text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m tt_matches%ROWTYPE;
  v_total int;
  v_new_server text;
  v_new_serves int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO m FROM tt_matches WHERE id = p_match_id FOR UPDATE;
  IF m.status != 'live' THEN RAISE EXCEPTION 'Match not live'; END IF;

  IF p_winner = 'A' THEN m.score_a := m.score_a + 1;
  ELSE m.score_b := m.score_b + 1; END IF;

  v_total := m.score_a + m.score_b;

  IF m.score_a >= 10 AND m.score_b >= 10 THEN
    v_new_serves := 1;
    IF m.serves_left <= 1 THEN
      v_new_server := CASE m.next_server WHEN 'A' THEN 'B' ELSE 'A' END;
      v_new_serves := 1;
    ELSE
      v_new_server := m.next_server;
      v_new_serves := m.serves_left - 1;
    END IF;
  ELSE
    v_new_serves := m.serves_left - 1;
    IF v_new_serves <= 0 THEN
      v_new_server := CASE m.next_server WHEN 'A' THEN 'B' ELSE 'A' END;
      v_new_serves := 2;
    ELSE
      v_new_server := m.next_server;
    END IF;
  END IF;

  IF (m.score_a >= 11 OR m.score_b >= 11) AND ABS(m.score_a - m.score_b) >= 2 THEN
    UPDATE tt_matches SET score_a = m.score_a, score_b = m.score_b,
      next_server = v_new_server, serves_left = v_new_serves, status = 'finished', updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE tt_matches SET score_a = m.score_a, score_b = m.score_b,
      next_server = v_new_server, serves_left = v_new_serves, updated_at = now()
    WHERE id = p_match_id;
  END IF;

  INSERT INTO tt_point_log (match_id, winner, score_a_after, score_b_after, server_after, serves_left_after)
  VALUES (p_match_id, p_winner, m.score_a, m.score_b, v_new_server, v_new_serves);
END; $function$;

-- Fix tt_reset_match: use next_server instead of current_server
CREATE OR REPLACE FUNCTION public.tt_reset_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  DELETE FROM tt_point_log WHERE match_id = p_match_id;
  UPDATE tt_matches SET score_a = 0, score_b = 0, next_server = first_server,
    serves_left = 2, status = 'live', updated_at = now()
  WHERE id = p_match_id;
END; $function$;

-- Fix tt_undo_last_point: use next_server instead of current_server
CREATE OR REPLACE FUNCTION public.tt_undo_last_point(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_last tt_point_log%ROWTYPE;
  v_prev tt_point_log%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT * INTO v_last FROM tt_point_log WHERE match_id = p_match_id ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No points to undo'; END IF;

  SELECT * INTO v_prev FROM tt_point_log WHERE match_id = p_match_id AND id < v_last.id ORDER BY id DESC LIMIT 1;

  IF FOUND THEN
    UPDATE tt_matches SET score_a = v_prev.score_a_after, score_b = v_prev.score_b_after,
      next_server = v_prev.server_after, serves_left = v_prev.serves_left_after,
      status = 'live', updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE tt_matches SET score_a = 0, score_b = 0,
      next_server = first_server, serves_left = 2,
      status = 'live', updated_at = now()
    WHERE id = p_match_id;
  END IF;

  DELETE FROM tt_point_log WHERE id = v_last.id;
END; $function$;

-- Fix tt_update_odds: write to tt_market_odds instead of tt_matches
CREATE OR REPLACE FUNCTION public.tt_update_odds(
  p_match_id uuid,
  p_ml_odds_a numeric DEFAULT NULL,
  p_spread_line numeric DEFAULT NULL,
  p_spread_odds numeric DEFAULT NULL,
  p_total_line numeric DEFAULT NULL,
  p_over_odds numeric DEFAULT NULL,
  p_under_odds numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO tt_market_odds (match_id, ml_a, spread_line, spread_a, total_line, over_odds, under_odds)
  VALUES (p_match_id,
    p_ml_odds_a, p_spread_line, p_spread_odds, p_total_line, p_over_odds, p_under_odds)
  ON CONFLICT (match_id) DO UPDATE SET
    ml_a = COALESCE(p_ml_odds_a, tt_market_odds.ml_a),
    spread_line = COALESCE(p_spread_line, tt_market_odds.spread_line),
    spread_a = COALESCE(p_spread_odds, tt_market_odds.spread_a),
    total_line = COALESCE(p_total_line, tt_market_odds.total_line),
    over_odds = COALESCE(p_over_odds, tt_market_odds.over_odds),
    under_odds = COALESCE(p_under_odds, tt_market_odds.under_odds),
    updated_at = now();
END; $function$;
