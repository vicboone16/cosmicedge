
-- API response cache (for Apify TTL caching)
CREATE TABLE public.api_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw staging: Apify actor run logs
CREATE TABLE public.apify_raw_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id TEXT NOT NULL,
  input_json JSONB,
  payload JSONB NOT NULL DEFAULT '[]',
  items_count INT DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw box scores staging
CREATE TABLE public.player_boxscores_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw picks staging
CREATE TABLE public.picks_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trending players (materialized by rebuild_trending)
CREATE TABLE public.trending_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league TEXT NOT NULL DEFAULT 'NBA',
  player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  player_name TEXT,
  team TEXT,
  position TEXT,
  headshot_url TEXT,
  trend_score NUMERIC DEFAULT 0,
  rank INT DEFAULT 0,
  reason JSONB DEFAULT '{}',
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trending_players_league ON public.trending_players(league);
CREATE INDEX idx_trending_players_rank ON public.trending_players(rank);

-- Trending teams (materialized by rebuild_trending)
CREATE TABLE public.trending_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league TEXT NOT NULL DEFAULT 'NBA',
  team_abbr TEXT NOT NULL,
  team_name TEXT,
  trend_score NUMERIC DEFAULT 0,
  rank INT DEFAULT 0,
  reason JSONB DEFAULT '{}',
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trending_teams_league ON public.trending_teams(league);
CREATE INDEX idx_trending_teams_rank ON public.trending_teams(rank);

-- RLS: all these are internal/service-role only tables (no user access needed)
-- api_cache
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.api_cache FOR ALL USING (false);

-- apify_raw_logs
ALTER TABLE public.apify_raw_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.apify_raw_logs FOR ALL USING (false);

-- player_boxscores_raw
ALTER TABLE public.player_boxscores_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.player_boxscores_raw FOR ALL USING (false);

-- picks_raw
ALTER TABLE public.picks_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.picks_raw FOR ALL USING (false);

-- trending_players: public SELECT, service-role write
ALTER TABLE public.trending_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read trending players" ON public.trending_players FOR SELECT USING (true);

-- trending_teams: public SELECT, service-role write  
ALTER TABLE public.trending_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read trending teams" ON public.trending_teams FOR SELECT USING (true);
