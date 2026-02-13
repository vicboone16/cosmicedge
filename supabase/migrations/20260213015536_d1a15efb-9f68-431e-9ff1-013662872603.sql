
-- Add unique constraints needed for upsert operations

-- players: upsert by external_id
ALTER TABLE public.players ADD CONSTRAINT players_external_id_unique UNIQUE (external_id);

-- player_season_stats: upsert by player+season+league
ALTER TABLE public.player_season_stats ADD CONSTRAINT player_season_stats_player_season_league_unique UNIQUE (player_id, season, league);

-- team_season_stats: upsert by team+season+league
ALTER TABLE public.team_season_stats ADD CONSTRAINT team_season_stats_team_season_league_unique UNIQUE (team_abbr, season, league);

-- team_game_stats: upsert by game+team
ALTER TABLE public.team_game_stats ADD CONSTRAINT team_game_stats_game_team_unique UNIQUE (game_id, team_abbr);

-- player_game_stats: upsert by game+player
ALTER TABLE public.player_game_stats ADD CONSTRAINT player_game_stats_game_player_unique UNIQUE (game_id, player_id);

-- game_quarters: upsert by game+quarter
ALTER TABLE public.game_quarters ADD CONSTRAINT game_quarters_game_quarter_unique UNIQUE (game_id, quarter);

-- play_by_play: upsert by game+sequence
ALTER TABLE public.play_by_play ADD CONSTRAINT play_by_play_game_sequence_unique UNIQUE (game_id, sequence);

-- games: upsert by external_id
CREATE UNIQUE INDEX IF NOT EXISTS games_external_id_unique ON public.games (external_id) WHERE external_id IS NOT NULL;

-- standings: upsert by league+season+team_name+provider
ALTER TABLE public.standings ADD CONSTRAINT standings_league_season_team_provider_unique UNIQUE (league, season, team_name, provider);
