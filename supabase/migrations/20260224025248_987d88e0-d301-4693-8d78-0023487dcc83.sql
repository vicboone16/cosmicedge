
DROP TABLE IF EXISTS public.np_player_prop_odds_history CASCADE;

CREATE TABLE public.np_player_prop_odds_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL,
  player_id uuid,
  prop_type text NOT NULL,
  book text NOT NULL,
  line numeric,
  side text,
  odds integer,
  snapshot_ts timestamptz NOT NULL DEFAULT now(),
  snapshot_minute timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  source text NOT NULL DEFAULT 'fetch-player-props'
);

CREATE UNIQUE INDEX idx_np_ppoh_minute_dedupe
  ON public.np_player_prop_odds_history (game_id, COALESCE(player_id, '00000000-0000-0000-0000-000000000000'::uuid), prop_type, book, COALESCE(side, ''), snapshot_minute);

ALTER TABLE public.np_player_prop_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "np_player_prop_odds_history publicly readable"
  ON public.np_player_prop_odds_history FOR SELECT USING (true);

CREATE POLICY "Service role can manage np_player_prop_odds_history"
  ON public.np_player_prop_odds_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_np_ppoh_game_player ON public.np_player_prop_odds_history (game_id, player_id, prop_type);
CREATE INDEX idx_np_ppoh_snapshot ON public.np_player_prop_odds_history (snapshot_ts DESC);
