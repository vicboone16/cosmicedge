-- Function to auto-settle bets when a game is finalized
CREATE OR REPLACE FUNCTION public.settle_bets_on_game(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
          -- line is from home perspective (e.g. -3.5 means home favored by 3.5)
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

      ELSE
        -- For other market types, skip auto-settlement
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

-- Update the on_game_finalized function to also settle bets
CREATE OR REPLACE FUNCTION public.on_game_finalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'final' AND (OLD.status IS NULL OR OLD.status != 'final') THEN
    PERFORM aggregate_period_stats(NEW.id);
    PERFORM settle_bets_on_game(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger (doesn't exist yet)
CREATE TRIGGER trg_game_finalized
  AFTER UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.on_game_finalized();