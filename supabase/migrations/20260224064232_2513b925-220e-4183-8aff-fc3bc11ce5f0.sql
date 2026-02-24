
CREATE INDEX IF NOT EXISTS idx_np_hist_lookup
ON public.np_player_prop_odds_history (game_id, player_id, prop_type, book, snapshot_ts DESC);
