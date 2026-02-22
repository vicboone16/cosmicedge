
-- Performance indexes for frequently queried columns
-- Games table: start_time used in WHERE/ORDER, league for filtering
CREATE INDEX IF NOT EXISTS idx_games_start_time ON public.games (start_time);
CREATE INDEX IF NOT EXISTS idx_games_league_start ON public.games (league, start_time);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games (status);
CREATE INDEX IF NOT EXISTS idx_games_external_id ON public.games (external_id);

-- Odds snapshots: game_id + captured_at for latest odds lookup
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_game_captured ON public.odds_snapshots (game_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market ON public.odds_snapshots (game_id, market_type);

-- Game quarters: game_id + quarter for period scores
CREATE INDEX IF NOT EXISTS idx_game_quarters_game ON public.game_quarters (game_id, quarter);

-- Game state snapshots: game_id + captured_at for live updates
CREATE INDEX IF NOT EXISTS idx_game_state_snapshots_game ON public.game_state_snapshots (game_id, captured_at DESC);

-- Player game stats: player_id + game_id for lookups
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON public.player_game_stats (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game ON public.player_game_stats (game_id, player_id);

-- Players: team + league for roster lookups
CREATE INDEX IF NOT EXISTS idx_players_team_league ON public.players (team, league);

-- Injuries: team + league for game page
CREATE INDEX IF NOT EXISTS idx_injuries_team_league ON public.injuries (team_abbr, league);

-- Player props: game_id + player_name
CREATE INDEX IF NOT EXISTS idx_player_props_game ON public.player_props (game_id, player_name);

-- Astro calculations: entity lookups
CREATE INDEX IF NOT EXISTS idx_astro_calc_entity ON public.astro_calculations (entity_id, calc_type, calc_date);
CREATE INDEX IF NOT EXISTS idx_astro_calc_expires ON public.astro_calculations (expires_at);

-- Cosmic games: date + league for backfill
CREATE INDEX IF NOT EXISTS idx_cosmic_games_date_league ON public.cosmic_games (game_date, league);
CREATE INDEX IF NOT EXISTS idx_cosmic_games_teams ON public.cosmic_games (home_team_abbr, away_team_abbr, game_date);

-- PBP quarter team stats: game_key for period score lookups
CREATE INDEX IF NOT EXISTS idx_pbp_qts_gamekey ON public.pbp_quarter_team_stats (game_key, period);

-- PBP events: game_key + period for play-by-play
CREATE INDEX IF NOT EXISTS idx_pbp_events_gamekey ON public.pbp_events (game_key, period);

-- Historical odds: game_id for linking
CREATE INDEX IF NOT EXISTS idx_historical_odds_game ON public.historical_odds (game_id);

-- Bets: user_id + game_id for settlement and user views
CREATE INDEX IF NOT EXISTS idx_bets_user ON public.bets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_game ON public.bets (game_id, status);

-- Depth charts: team + league
CREATE INDEX IF NOT EXISTS idx_depth_charts_team ON public.depth_charts (team_abbr, league);

-- NBA PBP events: game_id + period
CREATE INDEX IF NOT EXISTS idx_nba_pbp_game_period ON public.nba_play_by_play_events (game_id, period);
