
-- 1. np_norm_cdf: standard normal CDF (immutable, used by edgescore computations)
CREATE OR REPLACE FUNCTION public.np_norm_cdf(z double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  t double precision;
  b1 double precision :=  0.319381530;
  b2 double precision := -0.356563782;
  b3 double precision :=  1.781477937;
  b4 double precision := -1.821255978;
  b5 double precision :=  1.330274429;
  p  double precision :=  0.2316419;
  c  double precision :=  0.3989422804014327;
  x  double precision;
  poly double precision;
  approx double precision;
begin
  x := abs(z);
  t := 1.0 / (1.0 + p * x);
  poly := ((((b5*t + b4)*t + b3)*t + b2)*t + b1)*t;
  approx := 1.0 - c * exp(-0.5 * x * x) * poly;
  if z < 0 then
    return 1.0 - approx;
  else
    return approx;
  end if;
end;
$function$;

-- 2. np_apply_edgescore_v11: batch-update edge_score from v11 view
CREATE OR REPLACE FUNCTION public.np_apply_edgescore_v11(hours_back integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  updated_rows int;
begin
  update public.nebula_prop_predictions p
  set edge_score = v.edgescore_v11,
      updated_at = now()
  from public.np_v_predictions_edgescore_v11 v
  where v.id = p.id
    and p.pred_ts > now() - make_interval(hours => hours_back)
    and v.edgescore_v11 is not null;
  get diagnostics updated_rows = row_count;
  return updated_rows;
end;
$function$;

-- 3. np_persist_edgescore_v11: persist edge_score_v11 from v11 view
CREATE OR REPLACE FUNCTION public.np_persist_edgescore_v11(minutes_back integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  updated_rows int;
begin
  update public.nebula_prop_predictions p
  set
    edge_score_v11 = v.edgescore_v11,
    updated_at = now()
  from public.np_v_predictions_edgescore_v11 v
  where v.id = p.id
    and p.pred_ts > now() - make_interval(mins => minutes_back)
    and v.edgescore_v11 is not null;
  get diagnostics updated_rows = row_count;
  return updated_rows;
end;
$function$;

-- 4. np_player_prop_stat_long: unpivots player_game_stats into prop_type/stat_value
CREATE OR REPLACE VIEW public.np_player_prop_stat_long AS
SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_points'::text AS prop_type,
    (player_game_stats.points)::numeric AS stat_value
   FROM player_game_stats
UNION ALL
 SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_rebounds'::text AS prop_type,
    (player_game_stats.rebounds)::numeric AS stat_value
   FROM player_game_stats
UNION ALL
 SELECT player_game_stats.game_id,
    player_game_stats.player_id,
    'player_assists'::text AS prop_type,
    (player_game_stats.assists)::numeric AS stat_value
   FROM player_game_stats;

-- 5. np_v_closing_lines: last snapshot per prop from odds history
CREATE OR REPLACE VIEW public.np_v_closing_lines AS
SELECT DISTINCT ON (game_id, player_id, prop_type, book, side)
    game_id,
    player_id,
    prop_type,
    book,
    side,
    line AS closing_line,
    odds AS closing_odds,
    snapshot_ts AS closing_ts
   FROM np_player_prop_odds_history
  ORDER BY game_id, player_id, prop_type, book, side, snapshot_ts DESC;

-- 6. np_v_backtest_overlay: joins predictions with closing lines
CREATE OR REPLACE VIEW public.np_v_backtest_overlay AS
SELECT p.game_id,
    p.player_id,
    p.prop_type,
    p.book,
    p.side,
    p.line AS pred_line,
    p.odds AS pred_odds,
    p.edge_score,
    p.confidence,
    p.pred_ts,
    cl.closing_line,
    cl.closing_odds,
    cl.closing_ts,
    (cl.closing_line - p.line) AS clv_line_diff
   FROM nebula_prop_predictions p
     LEFT JOIN np_v_closing_lines cl ON cl.game_id = p.game_id AND cl.player_id = p.player_id AND cl.prop_type = p.prop_type AND cl.book = p.book AND cl.side = p.side;

-- 7. np_v_backtest_results: joins overlay with actual stats + win_flag
CREATE OR REPLACE VIEW public.np_v_backtest_results AS
SELECT o.game_id,
    o.player_id,
    o.prop_type,
    o.book,
    o.side,
    o.pred_line,
    o.pred_odds,
    o.edge_score,
    o.confidence,
    o.pred_ts,
    o.closing_line,
    o.closing_odds,
    o.closing_ts,
    o.clv_line_diff,
    s.stat_value,
    CASE
        WHEN lower(o.side) = 'over' AND s.stat_value > o.pred_line THEN 1
        WHEN lower(o.side) = 'under' AND s.stat_value < o.pred_line THEN 1
        ELSE 0
    END AS win_flag
   FROM np_v_backtest_overlay o
     LEFT JOIN np_player_prop_stat_long s ON s.game_id = o.game_id AND s.player_id = o.player_id AND s.prop_type = o.prop_type;
