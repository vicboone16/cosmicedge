
-- Re-create objects that exist on Live but are missing from Test
-- This ensures the schema diff is clean and publish can succeed

-- 1. Function: american_to_break_even_prob
CREATE OR REPLACE FUNCTION public.american_to_break_even_prob(odds integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
select case
  when odds is null then null
  when odds < 0 then abs(odds)::numeric / (abs(odds)::numeric + 100)
  else 100::numeric / (odds::numeric + 100)
end;
$function$;

-- 2. Table: tt_market_odds
CREATE TABLE IF NOT EXISTS public.tt_market_odds (
  match_id uuid NOT NULL PRIMARY KEY REFERENCES public.tt_matches(id) ON DELETE CASCADE,
  ml_a integer,
  spread_line numeric,
  spread_a integer,
  total_line numeric,
  over_odds integer,
  under_odds integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: tt_match_metrics
CREATE TABLE IF NOT EXISTS public.tt_match_metrics (
  match_id uuid NOT NULL PRIMARY KEY REFERENCES public.tt_matches(id) ON DELETE CASCADE,
  ps numeric NOT NULL,
  pr numeric NOT NULL,
  win_prob_a numeric NOT NULL,
  cover_m05 numeric NOT NULL,
  cover_m15 numeric NOT NULL,
  cover_m25 numeric NOT NULL,
  cover_m35 numeric NOT NULL,
  cover_m45 numeric NOT NULL,
  over_165 numeric NOT NULL,
  over_175 numeric NOT NULL,
  over_185 numeric NOT NULL,
  over_195 numeric NOT NULL,
  over_205 numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Add missing columns to tt_matches to match Live schema
ALTER TABLE public.tt_matches ADD COLUMN IF NOT EXISTS next_server text;
ALTER TABLE public.tt_matches ADD COLUMN IF NOT EXISTS edge_threshold numeric;
ALTER TABLE public.tt_matches ADD COLUMN IF NOT EXISTS best_bet_threshold numeric;

-- 5. View: tt_match_list
CREATE OR REPLACE VIEW public.tt_match_list AS
SELECT m.id AS match_id,
    m.status,
    m.player_a,
    m.player_b,
    m.score_a,
    m.score_b,
    m.next_server,
    m.serves_left,
    x.win_prob_a,
    x.cover_m15,
    x.over_185,
    o.ml_a,
    o.spread_line,
    o.spread_a,
    o.total_line,
    o.over_odds,
    o.under_odds,
    american_to_break_even_prob(o.ml_a) AS ml_break_even,
    american_to_break_even_prob(o.spread_a) AS spread_break_even,
    american_to_break_even_prob(o.over_odds) AS over_break_even,
    x.win_prob_a - american_to_break_even_prob(o.ml_a) AS ml_edge,
    x.cover_m15 - american_to_break_even_prob(o.spread_a) AS spread_edge,
    x.over_185 - american_to_break_even_prob(o.over_odds) AS over_edge,
    x.updated_at AS metrics_updated_at
FROM tt_matches m
LEFT JOIN tt_match_metrics x ON x.match_id = m.id
LEFT JOIN tt_market_odds o ON o.match_id = m.id
WHERE m.status = 'live';
