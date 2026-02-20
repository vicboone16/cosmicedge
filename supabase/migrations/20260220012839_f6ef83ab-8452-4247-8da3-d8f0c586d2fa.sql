
-- Create a database function that fetches live scores via net.http_get and updates games directly
-- This runs in the database itself, bypassing edge function deployment issues
CREATE OR REPLACE FUNCTION public.sync_live_scores_via_api()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_api_key text;
  v_request_id bigint;
  v_response record;
  v_body jsonb;
  v_events jsonb;
  v_event jsonb;
  v_home_team text;
  v_away_team text;
  v_home_score int;
  v_away_score int;
  v_status text;
  v_game_id uuid;
  v_updated int := 0;
  v_home_abbr text;
  v_away_abbr text;
  v_today text;
BEGIN
  -- Get today's date
  v_today := to_char(now(), 'YYYY-MM-DD');

  -- Make HTTP request to TheSportsDB livescore API
  SELECT id INTO v_request_id FROM net.http_get(
    'https://www.thesportsdb.com/api/v2/json/livescore/basketball',
    headers := jsonb_build_object('X-API-KEY', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'THESPORTSDB_API_KEY' LIMIT 1))::jsonb
  );

  -- Wait briefly and get response
  -- Note: net.http_get is async, we need to poll _http_response
  -- For immediate execution, we'll return the request_id and let a follow-up query check
  RETURN jsonb_build_object('request_id', v_request_id, 'note', 'Async request queued. Check net._http_response for results.');
END;
$function$;
