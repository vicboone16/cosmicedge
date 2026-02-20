
CREATE OR REPLACE FUNCTION settle_bets_on_game(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_score int;
  v_away_score int;
  v_home_abbr text;
  v_away_abbr text;
  v_home_team text;
  v_away_team text;
  rec RECORD;
  v_result text;
  v_payout numeric;
  v_total int;
  v_q_home int;
  v_q_away int;
  v_q_total int;
  v_half_home int;
  v_half_away int;
  v_half_total int;
BEGIN
  -- Get game info
  SELECT home_score, away_score, home_abbr, away_abbr, home_team, away_team
  INTO v_home_score, v_away_score, v_home_abbr, v_away_abbr, v_home_team, v_away_team
  FROM games WHERE id = p_game_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN
    RETURN; -- Can't settle without scores
  END IF;

  v_total := v_home_score + v_away_score;

  -- Loop through unsettled bets for this game
  FOR rec IN
    SELECT id, market_type, selection, side, odds, stake_amount, line
    FROM bets
    WHERE game_id = p_game_id
      AND (result IS NULL OR result = 'pending')
      AND status NOT IN ('settled', 'won', 'lost', 'push', 'void')
  LOOP
    v_result := 'loss';
    v_payout := 0;

    -- Determine result based on market type
    CASE rec.market_type
      WHEN 'moneyline' THEN
        IF (rec.side = 'home' OR LOWER(rec.selection) = LOWER(v_home_abbr) OR LOWER(rec.selection) = LOWER(v_home_team))
           AND v_home_score > v_away_score THEN
          v_result := 'win';
        ELSIF (rec.side = 'away' OR LOWER(rec.selection) = LOWER(v_away_abbr) OR LOWER(rec.selection) = LOWER(v_away_team))
           AND v_away_score > v_home_score THEN
          v_result := 'win';
        ELSIF v_home_score = v_away_score THEN
          v_result := 'push';
        END IF;

      WHEN 'spread' THEN
        IF rec.line IS NOT NULL THEN
          IF (rec.side = 'home' OR LOWER(rec.selection) = LOWER(v_home_abbr) OR LOWER(rec.selection) = LOWER(v_home_team)) THEN
            IF (v_home_score + rec.line) > v_away_score THEN v_result := 'win';
            ELSIF (v_home_score + rec.line) = v_away_score THEN v_result := 'push';
            END IF;
          ELSE
            IF (v_away_score - rec.line) > v_home_score THEN v_result := 'win';
            ELSIF (v_away_score - rec.line) = v_home_score THEN v_result := 'push';
            END IF;
          END IF;
        END IF;

      WHEN 'total' THEN
        IF rec.line IS NOT NULL THEN
          IF (rec.side = 'over' OR LOWER(rec.selection) = 'over') AND v_total > rec.line THEN
            v_result := 'win';
          ELSIF (rec.side = 'under' OR LOWER(rec.selection) = 'under') AND v_total < rec.line THEN
            v_result := 'win';
          ELSIF v_total = rec.line THEN
            v_result := 'push';
          END IF;
        END IF;

      WHEN 'first_quarter' THEN
        -- Get Q1 scores from game_quarters
        SELECT home_score, away_score INTO v_q_home, v_q_away
        FROM game_quarters WHERE game_id = p_game_id AND quarter = 1;
        IF v_q_home IS NOT NULL AND v_q_away IS NOT NULL THEN
          v_q_total := v_q_home + v_q_away;
          IF rec.line IS NOT NULL THEN
            IF (rec.side = 'over' OR LOWER(rec.selection) = 'over') AND v_q_total > rec.line THEN
              v_result := 'win';
            ELSIF (rec.side = 'under' OR LOWER(rec.selection) = 'under') AND v_q_total < rec.line THEN
              v_result := 'win';
            ELSIF v_q_total = rec.line THEN
              v_result := 'push';
            END IF;
          END IF;
        END IF;

      WHEN 'first_half' THEN
        -- Sum Q1+Q2 for first half
        SELECT COALESCE(SUM(home_score), 0), COALESCE(SUM(away_score), 0)
        INTO v_half_home, v_half_away
        FROM game_quarters WHERE game_id = p_game_id AND quarter IN (1, 2);
        v_half_total := v_half_home + v_half_away;
        IF v_half_total > 0 AND rec.line IS NOT NULL THEN
          IF (rec.side = 'over' OR LOWER(rec.selection) = 'over') AND v_half_total > rec.line THEN
            v_result := 'win';
          ELSIF (rec.side = 'under' OR LOWER(rec.selection) = 'under') AND v_half_total < rec.line THEN
            v_result := 'win';
          ELSIF v_half_total = rec.line THEN
            v_result := 'push';
          END IF;
        END IF;

      WHEN 'team_total' THEN
        -- Team total: check which team and compare against full game score
        IF rec.line IS NOT NULL THEN
          IF (rec.side = 'home' OR LOWER(rec.selection) = LOWER(v_home_abbr) OR LOWER(rec.selection) = LOWER(v_home_team)) THEN
            IF (rec.side = 'over' OR POSITION('over' IN LOWER(COALESCE(rec.selection, ''))) > 0) AND v_home_score > rec.line THEN
              v_result := 'win';
            ELSIF (rec.side = 'under' OR POSITION('under' IN LOWER(COALESCE(rec.selection, ''))) > 0) AND v_home_score < rec.line THEN
              v_result := 'win';
            ELSIF v_home_score = rec.line OR v_away_score = rec.line THEN
              v_result := 'push';
            ELSE
              -- Default: compare total against line
              IF v_total > rec.line THEN v_result := 'win';
              ELSIF v_total = rec.line THEN v_result := 'push';
              END IF;
            END IF;
          ELSE
            IF v_away_score > rec.line THEN v_result := 'win';
            ELSIF v_away_score < rec.line THEN v_result := 'loss';
            ELSIF v_away_score = rec.line THEN v_result := 'push';
            END IF;
          END IF;
        END IF;

      ELSE
        -- For truly unknown market types, skip
        CONTINUE;
    END CASE;

    -- Calculate payout
    IF v_result = 'win' AND rec.stake_amount IS NOT NULL AND rec.odds IS NOT NULL THEN
      IF rec.odds > 0 THEN
        v_payout := rec.stake_amount + (rec.stake_amount * rec.odds / 100.0);
      ELSE
        v_payout := rec.stake_amount + (rec.stake_amount * 100.0 / ABS(rec.odds));
      END IF;
    ELSIF v_result = 'push' THEN
      v_payout := COALESCE(rec.stake_amount, 0);
    END IF;

    -- Update the bet
    UPDATE bets
    SET result = v_result,
        payout = v_payout,
        status = 'settled',
        settled_at = now(),
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END;
$$;
