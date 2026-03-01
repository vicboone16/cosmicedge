
CREATE TABLE public.game_live_wp (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('full', 'half', 'quarter')),
  wp_home numeric NOT NULL,
  fair_ml_home integer,
  fair_ml_away integer,
  possessions_remaining numeric,
  score_diff integer,
  time_remaining_sec integer,
  quarter integer,
  sport text NOT NULL DEFAULT 'NBA',
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_key, scope)
);

CREATE INDEX idx_game_live_wp_game_key ON public.game_live_wp (game_key);

ALTER TABLE public.game_live_wp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live WP" ON public.game_live_wp
  FOR SELECT USING (true);

CREATE POLICY "Service role can write live WP" ON public.game_live_wp
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_live_wp;
