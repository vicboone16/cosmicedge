-- Phase 1D: PacePulse – Game-environment model
-- Stores per-game environmental predictions: expected possessions, blowout risk, pace delta

-- Table: team_season_pace (pre-computed team pace metrics per season)
CREATE TABLE IF NOT EXISTS public.team_season_pace (
  team_abbr text NOT NULL,
  season int NOT NULL DEFAULT 2025,
  league text NOT NULL DEFAULT 'NBA',
  games_played int NOT NULL DEFAULT 0,
  avg_possessions numeric NOT NULL DEFAULT 0,
  avg_pace numeric NOT NULL DEFAULT 0,       -- possessions per 48 min
  avg_points numeric NOT NULL DEFAULT 0,
  avg_points_allowed numeric NOT NULL DEFAULT 0,
  off_rating numeric,                        -- points per 100 possessions
  def_rating numeric,
  net_rating numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_abbr, season, league)
);

ALTER TABLE public.team_season_pace ENABLE ROW LEVEL SECURITY;

-- Public read for all users
CREATE POLICY "Anyone can read team pace"
  ON public.team_season_pace FOR SELECT
  USING (true);

-- Admin-only write
CREATE POLICY "Admins can write team pace"
  ON public.team_season_pace FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function: np_build_pace_features
-- Computes game-environment features for a given game
CREATE OR REPLACE FUNCTION public.np_build_pace_features(
  p_game_id uuid
)
RETURNS TABLE(
  home_avg_pace numeric,
  away_avg_pace numeric,
  expected_possessions numeric,
  home_off_rating numeric,
  home_def_rating numeric,
  away_off_rating numeric,
  away_def_rating numeric,
  blowout_risk numeric,
  team_pace_delta numeric,
  home_net_rating numeric,
  away_net_rating numeric,
  matchup_pace_avg numeric,
  games_home int,
  games_away int
)
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $func$
DECLARE
  v_home_abbr text;
  v_away_abbr text;
  v_league text;
  v_season int;
  
  h_pace numeric := 100; -- league-average default
  a_pace numeric := 100;
  h_off numeric := 110;
  h_def numeric := 110;
  a_off numeric := 110;
  a_def numeric := 110;
  h_net numeric := 0;
  a_net numeric := 0;
  h_games int := 0;
  a_games int := 0;
  
  v_exp_poss numeric;
  v_blowout numeric;
  v_pace_delta numeric;
  v_matchup_pace numeric;
BEGIN
  -- Get game info
  SELECT home_abbr, away_abbr, league INTO v_home_abbr, v_away_abbr, v_league
  FROM games WHERE id = p_game_id;
  
  IF v_home_abbr IS NULL THEN
    RETURN;
  END IF;
  
  -- Determine season
  v_season := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 10 THEN EXTRACT(YEAR FROM now())::int
    ELSE (EXTRACT(YEAR FROM now()) - 1)::int
  END;
  
  -- Fetch home team pace
  SELECT tsp.avg_pace, tsp.off_rating, tsp.def_rating, tsp.net_rating, tsp.games_played
  INTO h_pace, h_off, h_def, h_net, h_games
  FROM team_season_pace tsp
  WHERE tsp.team_abbr = v_home_abbr AND tsp.season = v_season AND tsp.league = v_league;
  
  -- Fetch away team pace
  SELECT tsp.avg_pace, tsp.off_rating, tsp.def_rating, tsp.net_rating, tsp.games_played
  INTO a_pace, a_off, a_def, a_net, a_games
  FROM team_season_pace tsp
  WHERE tsp.team_abbr = v_away_abbr AND tsp.season = v_season AND tsp.league = v_league;
  
  -- Defaults if no data
  h_pace := COALESCE(h_pace, 100);
  a_pace := COALESCE(a_pace, 100);
  h_off := COALESCE(h_off, 110);
  h_def := COALESCE(h_def, 110);
  a_off := COALESCE(a_off, 110);
  a_def := COALESCE(a_def, 110);
  h_net := COALESCE(h_net, 0);
  a_net := COALESCE(a_net, 0);
  h_games := COALESCE(h_games, 0);
  a_games := COALESCE(a_games, 0);
  
  -- Expected possessions: average of both teams' pace
  v_matchup_pace := round((h_pace + a_pace) / 2.0, 2);
  v_exp_poss := round(v_matchup_pace * 48.0 / 48.0, 1); -- pace IS possessions/48
  
  -- Blowout risk: based on net rating differential
  -- Large net rating gap → higher blowout probability
  v_blowout := LEAST(1.0, GREATEST(0.0,
    round(ABS(h_net - a_net) / 30.0, 4)
  ));
  
  -- Team pace delta: how much faster/slower this matchup is vs league average
  v_pace_delta := round(v_matchup_pace - 100.0, 2);
  
  RETURN QUERY SELECT
    h_pace, a_pace, v_exp_poss,
    h_off, h_def, a_off, a_def,
    v_blowout, v_pace_delta,
    h_net, a_net, v_matchup_pace,
    h_games, a_games;
END;
$func$;
