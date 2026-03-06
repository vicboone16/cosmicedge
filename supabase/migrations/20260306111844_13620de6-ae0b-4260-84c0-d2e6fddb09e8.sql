
-- Table Tennis match tracking
CREATE TABLE IF NOT EXISTS public.tt_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a text NOT NULL,
  player_b text NOT NULL,
  score_a int NOT NULL DEFAULT 0,
  score_b int NOT NULL DEFAULT 0,
  first_server text NOT NULL DEFAULT 'A' CHECK (first_server IN ('A','B')),
  current_server text NOT NULL DEFAULT 'A' CHECK (current_server IN ('A','B')),
  serves_left int NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','finished')),
  p_s numeric NOT NULL DEFAULT 0.56,
  p_r numeric NOT NULL DEFAULT 0.52,
  ml_odds_a numeric,
  spread_line numeric,
  spread_odds numeric,
  total_line numeric,
  over_odds numeric,
  under_odds numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access tt_matches" ON public.tt_matches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Point log for undo
CREATE TABLE IF NOT EXISTS public.tt_point_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.tt_matches(id) ON DELETE CASCADE,
  winner text NOT NULL CHECK (winner IN ('A','B')),
  score_a_after int NOT NULL,
  score_b_after int NOT NULL,
  server_after text NOT NULL,
  serves_left_after int NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_point_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access tt_point_log" ON public.tt_point_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Start match RPC
CREATE OR REPLACE FUNCTION public.tt_start_match(
  p_player_a text,
  p_player_b text,
  p_first_server text DEFAULT 'A',
  p_ps numeric DEFAULT 0.56,
  p_pr numeric DEFAULT 0.52
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO tt_matches (player_a, player_b, first_server, current_server, p_s, p_r)
  VALUES (p_player_a, p_player_b, p_first_server, p_first_server, p_ps, p_pr)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Log point RPC
CREATE OR REPLACE FUNCTION public.tt_log_point(p_match_id uuid, p_winner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Serve rotation: every 2 points, or every 1 in deuce (both >= 10)
  IF m.score_a >= 10 AND m.score_b >= 10 THEN
    -- Deuce: alternate every point
    v_new_serves := 1;
    IF m.serves_left <= 1 THEN
      v_new_server := CASE m.current_server WHEN 'A' THEN 'B' ELSE 'A' END;
      v_new_serves := 1;
    ELSE
      v_new_server := m.current_server;
      v_new_serves := m.serves_left - 1;
    END IF;
  ELSE
    v_new_serves := m.serves_left - 1;
    IF v_new_serves <= 0 THEN
      v_new_server := CASE m.current_server WHEN 'A' THEN 'B' ELSE 'A' END;
      v_new_serves := 2;
    ELSE
      v_new_server := m.current_server;
    END IF;
  END IF;

  -- Check game over (first to 11, win by 2)
  IF (m.score_a >= 11 OR m.score_b >= 11) AND ABS(m.score_a - m.score_b) >= 2 THEN
    UPDATE tt_matches SET score_a = m.score_a, score_b = m.score_b,
      current_server = v_new_server, serves_left = v_new_serves, status = 'finished', updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE tt_matches SET score_a = m.score_a, score_b = m.score_b,
      current_server = v_new_server, serves_left = v_new_serves, updated_at = now()
    WHERE id = p_match_id;
  END IF;

  INSERT INTO tt_point_log (match_id, winner, score_a_after, score_b_after, server_after, serves_left_after)
  VALUES (p_match_id, p_winner, m.score_a, m.score_b, v_new_server, v_new_serves);
END; $$;

-- Undo last point RPC
CREATE OR REPLACE FUNCTION public.tt_undo_last_point(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_last tt_point_log%ROWTYPE;
  v_prev tt_point_log%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT * INTO v_last FROM tt_point_log WHERE match_id = p_match_id ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No points to undo'; END IF;

  -- Get previous state
  SELECT * INTO v_prev FROM tt_point_log WHERE match_id = p_match_id AND id < v_last.id ORDER BY id DESC LIMIT 1;

  IF FOUND THEN
    UPDATE tt_matches SET score_a = v_prev.score_a_after, score_b = v_prev.score_b_after,
      current_server = v_prev.server_after, serves_left = v_prev.serves_left_after,
      status = 'live', updated_at = now()
    WHERE id = p_match_id;
  ELSE
    -- Back to 0-0
    UPDATE tt_matches SET score_a = 0, score_b = 0,
      current_server = first_server, serves_left = 2,
      status = 'live', updated_at = now()
    WHERE id = p_match_id;
  END IF;

  DELETE FROM tt_point_log WHERE id = v_last.id;
END; $$;

-- Reset match RPC
CREATE OR REPLACE FUNCTION public.tt_reset_match(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  DELETE FROM tt_point_log WHERE match_id = p_match_id;
  UPDATE tt_matches SET score_a = 0, score_b = 0, current_server = first_server,
    serves_left = 2, status = 'live', updated_at = now()
  WHERE id = p_match_id;
END; $$;

-- Update odds RPC
CREATE OR REPLACE FUNCTION public.tt_update_odds(
  p_match_id uuid,
  p_ml_odds_a numeric DEFAULT NULL,
  p_spread_line numeric DEFAULT NULL,
  p_spread_odds numeric DEFAULT NULL,
  p_total_line numeric DEFAULT NULL,
  p_over_odds numeric DEFAULT NULL,
  p_under_odds numeric DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE tt_matches SET
    ml_odds_a = COALESCE(p_ml_odds_a, ml_odds_a),
    spread_line = COALESCE(p_spread_line, spread_line),
    spread_odds = COALESCE(p_spread_odds, spread_odds),
    total_line = COALESCE(p_total_line, total_line),
    over_odds = COALESCE(p_over_odds, over_odds),
    under_odds = COALESCE(p_under_odds, under_odds),
    updated_at = now()
  WHERE id = p_match_id;
END; $$;

-- Admin dashboard view with model computations
CREATE OR REPLACE VIEW public.tt_admin_dashboard AS
WITH match_data AS (
  SELECT
    m.*,
    -- Win probability using geometric series model
    -- P(A wins from score_a, score_b) approximated via serve-based model
    CASE WHEN m.status = 'finished' THEN
      CASE WHEN m.score_a > m.score_b THEN 1.0 ELSE 0.0 END
    ELSE
      -- Simple Markov approx: ratio of remaining points needed
      ROUND(
        POWER(m.p_s, GREATEST(11 - m.score_a, 0)) *
        (1.0 - POWER(1.0 - m.p_r, GREATEST(11 - m.score_b, 0))) /
        NULLIF(
          POWER(m.p_s, GREATEST(11 - m.score_a, 0)) * (1.0 - POWER(1.0 - m.p_r, GREATEST(11 - m.score_b, 0)))
          + POWER(1.0 - m.p_s, GREATEST(11 - m.score_a, 0)) * POWER(m.p_r, GREATEST(11 - m.score_b, 0)),
          0
        ),
        4
      )
    END AS win_prob_a,
    m.score_a + m.score_b AS total_points,
    CASE m.current_server WHEN 'A' THEN m.player_a ELSE m.player_b END AS next_server
  FROM tt_matches m
)
SELECT
  d.id AS match_id,
  d.player_a, d.player_b,
  d.score_a, d.score_b,
  d.next_server,
  d.serves_left,
  d.status,
  d.win_prob_a,
  d.total_points,
  d.p_s, d.p_r,
  d.ml_odds_a, d.spread_line, d.spread_odds,
  d.total_line, d.over_odds, d.under_odds,

  -- Spread cover probabilities (simplified normal approx)
  -- Expected margin = (win_prob_a * 2 - 1) * remaining_points_est
  ROUND(GREATEST(0, LEAST(1, d.win_prob_a + 0.05)), 4) AS cover_m15,
  ROUND(GREATEST(0, LEAST(1, d.win_prob_a - 0.02)), 4) AS cover_m25,
  ROUND(GREATEST(0, LEAST(1, d.win_prob_a - 0.08)), 4) AS cover_m35,
  ROUND(GREATEST(0, LEAST(1, d.win_prob_a - 0.15)), 4) AS cover_m45,

  -- Totals probabilities
  ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 16.5 THEN 1.0
    ELSE 0.5 + (d.total_points - 10.0) / 20.0 END)), 4) AS over_165,
  ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 17.5 THEN 1.0
    ELSE 0.45 + (d.total_points - 10.0) / 22.0 END)), 4) AS over_175,
  ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 18.5 THEN 1.0
    ELSE 0.40 + (d.total_points - 10.0) / 25.0 END)), 4) AS over_185,
  ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 19.5 THEN 1.0
    ELSE 0.35 + (d.total_points - 10.0) / 28.0 END)), 4) AS over_195,
  ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 20.5 THEN 1.0
    ELSE 0.30 + (d.total_points - 10.0) / 30.0 END)), 4) AS over_205,

  -- Edge calculations (model prob - implied prob from odds)
  CASE WHEN d.ml_odds_a IS NOT NULL THEN
    ROUND(d.win_prob_a - CASE
      WHEN d.ml_odds_a < 0 THEN ABS(d.ml_odds_a) / (ABS(d.ml_odds_a) + 100.0)
      ELSE 100.0 / (d.ml_odds_a + 100.0) END, 4)
  ELSE NULL END AS ml_edge,

  CASE WHEN d.spread_odds IS NOT NULL THEN
    ROUND(GREATEST(0, LEAST(1, d.win_prob_a + 0.05)) - CASE
      WHEN d.spread_odds < 0 THEN ABS(d.spread_odds) / (ABS(d.spread_odds) + 100.0)
      ELSE 100.0 / (d.spread_odds + 100.0) END, 4)
  ELSE NULL END AS spread_edge_m15,

  CASE WHEN d.over_odds IS NOT NULL THEN
    ROUND(GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 18.5 THEN 1.0
      ELSE 0.40 + (d.total_points - 10.0) / 25.0 END)) - CASE
      WHEN d.over_odds < 0 THEN ABS(d.over_odds) / (ABS(d.over_odds) + 100.0)
      ELSE 100.0 / (d.over_odds + 100.0) END, 4)
  ELSE NULL END AS over_edge_185,

  CASE WHEN d.under_odds IS NOT NULL THEN
    ROUND((1.0 - GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 18.5 THEN 1.0
      ELSE 0.40 + (d.total_points - 10.0) / 25.0 END))) - CASE
      WHEN d.under_odds < 0 THEN ABS(d.under_odds) / (ABS(d.under_odds) + 100.0)
      ELSE 100.0 / (d.under_odds + 100.0) END, 4)
  ELSE NULL END AS under_edge_185,

  -- Best bet tag
  CASE
    WHEN d.ml_odds_a IS NOT NULL AND (d.win_prob_a - CASE
      WHEN d.ml_odds_a < 0 THEN ABS(d.ml_odds_a) / (ABS(d.ml_odds_a) + 100.0)
      ELSE 100.0 / (d.ml_odds_a + 100.0) END) > 0.05 THEN 'ML A'
    WHEN d.spread_odds IS NOT NULL AND (GREATEST(0, LEAST(1, d.win_prob_a + 0.05)) - CASE
      WHEN d.spread_odds < 0 THEN ABS(d.spread_odds) / (ABS(d.spread_odds) + 100.0)
      ELSE 100.0 / (d.spread_odds + 100.0) END) > 0.05 THEN 'SPREAD A -1.5'
    WHEN d.over_odds IS NOT NULL AND (GREATEST(0, LEAST(1, CASE WHEN d.total_points >= 18.5 THEN 1.0
      ELSE 0.40 + (d.total_points - 10.0) / 25.0 END)) - CASE
      WHEN d.over_odds < 0 THEN ABS(d.over_odds) / (ABS(d.over_odds) + 100.0)
      ELSE 100.0 / (d.over_odds + 100.0) END) > 0.05 THEN 'OVER 18.5'
    ELSE 'NONE'
  END AS best_bet_tag,

  d.created_at,
  d.updated_at
FROM match_data d;
