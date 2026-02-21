
-- Add unique constraints for canonical data model

-- cosmic_game_id_map: unique (provider, provider_game_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cosmic_game_id_map_provider_provider_game_id_key'
  ) THEN
    ALTER TABLE public.cosmic_game_id_map
      ADD CONSTRAINT cosmic_game_id_map_provider_provider_game_id_key
      UNIQUE (provider, provider_game_id);
  END IF;
END $$;

-- pbp_events: unique (provider, provider_game_id, provider_event_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pbp_events_provider_game_event_key'
  ) THEN
    ALTER TABLE public.pbp_events
      ADD CONSTRAINT pbp_events_provider_game_event_key
      UNIQUE (provider, provider_game_id, provider_event_id);
  END IF;
END $$;

-- pbp_quarter_team_stats: unique (game_key, provider, period, team_abbr)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pbp_quarter_team_stats_game_provider_period_team_key'
  ) THEN
    ALTER TABLE public.pbp_quarter_team_stats
      ADD CONSTRAINT pbp_quarter_team_stats_game_provider_period_team_key
      UNIQUE (game_key, provider, period, team_abbr);
  END IF;
END $$;
