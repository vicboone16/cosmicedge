CREATE TABLE IF NOT EXISTS public.bdl_player_cache (
  bdl_id text PRIMARY KEY,
  first_name text,
  last_name text,
  full_name text GENERATED ALWAYS AS (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) STORED,
  team text,
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE public.bdl_player_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read bdl_player_cache" ON public.bdl_player_cache FOR SELECT USING (true);
CREATE POLICY "Service role full access on bdl_player_cache" ON public.bdl_player_cache FOR ALL USING (true) WITH CHECK (true);