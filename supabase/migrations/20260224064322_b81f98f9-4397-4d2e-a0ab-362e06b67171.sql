
CREATE OR REPLACE FUNCTION public.np_set_snapshot_minute()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.snapshot_ts IS NULL THEN NEW.snapshot_ts := now(); END IF;
  NEW.snapshot_minute := date_trunc('minute', NEW.snapshot_ts);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_np_set_snapshot_minute ON public.np_player_prop_odds_history;

CREATE TRIGGER trg_np_set_snapshot_minute
BEFORE INSERT ON public.np_player_prop_odds_history
FOR EACH ROW EXECUTE FUNCTION public.np_set_snapshot_minute();
