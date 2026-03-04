
DO $$
BEGIN
  -- Add tables to realtime publication only if not already members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_state_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state_snapshots;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'nba_pbp_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nba_pbp_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'nba_player_props_live'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nba_player_props_live;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'nba_game_odds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nba_game_odds;
  END IF;
END $$;
