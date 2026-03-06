-- Backfill CE schema objects into migration history so publish diff does not attempt destructive DROPs on Live
CREATE TABLE IF NOT EXISTS public.ce_props_norm (
  id uuid PRIMARY KEY,
  source_table text,
  game_key uuid,
  game_date date,
  bdl_player_id bigint,
  model_player_id bigint,
  player_name text,
  prop_type text,
  stat_key text,
  market_type text,
  line_value numeric,
  over_odds numeric,
  under_odds numeric,
  provider text,
  vendor text,
  raw jsonb,
  loaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ce_injury_status (
  player_id bigint,
  team_id bigint,
  status text,
  usage_impact numeric,
  updated_at timestamptz
);

CREATE OR REPLACE FUNCTION public.ce_uuid_to_bigint(p_text text)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ('x' || substr(md5(p_text), 1, 16))::bit(64)::bigint;
$function$;

CREATE OR REPLACE FUNCTION public.ce_randn()
 RETURNS double precision
 LANGUAGE sql
AS $function$
select sqrt(-2.0 * ln(greatest(1e-12, random())))
     * cos(2.0 * pi() * random());
$function$;

CREATE OR REPLACE VIEW public.ce_player_game_logs_src AS
 SELECT game_id,
    created_at::date AS game_date,
    ce_uuid_to_bigint(player_id::text) AS player_id,
    NULL::integer AS team_id,
    NULL::integer AS opponent_team_id,
    COALESCE(points, 0)::numeric AS pts,
    COALESCE(rebounds, 0)::numeric AS reb,
    COALESCE(assists, 0)::numeric AS ast,
    COALESCE(three_made, 0)::numeric AS fg3m,
    COALESCE(steals, 0)::numeric AS stl,
    COALESCE(blocks, 0)::numeric AS blk,
    COALESCE(turnovers, 0)::numeric AS tov,
    COALESCE(minutes, 0)::numeric AS minutes,
    plus_minus::numeric AS plus_minus,
    NULL::numeric AS pie
   FROM player_game_stats pgs
  WHERE game_id IS NOT NULL AND player_id IS NOT NULL AND created_at IS NOT NULL;

CREATE OR REPLACE VIEW public.ce_players_name_map AS
 SELECT ce_uuid_to_bigint(to_jsonb(p.*) ->> 'id'::text) AS model_player_id,
    lower(regexp_replace(TRIM(BOTH FROM COALESCE(NULLIF(to_jsonb(p.*) ->> 'name'::text, ''::text), NULLIF(to_jsonb(p.*) ->> 'full_name'::text, ''::text), concat_ws(' '::text, NULLIF(to_jsonb(p.*) ->> 'first_name'::text, ''::text), NULLIF(to_jsonb(p.*) ->> 'last_name'::text, ''::text)))), '[^a-z0-9 ]'::text, ''::text, 'g'::text)) AS player_name_norm
   FROM players p
  WHERE COALESCE(NULLIF(to_jsonb(p.*) ->> 'name'::text, ''::text), NULLIF(to_jsonb(p.*) ->> 'full_name'::text, ''::text), concat_ws(' '::text, NULLIF(to_jsonb(p.*) ->> 'first_name'::text, ''::text), NULLIF(to_jsonb(p.*) ->> 'last_name'::text, ''::text))) IS NOT NULL;

CREATE OR REPLACE VIEW public.ce_momentum_live AS
 WITH ranked AS (
         SELECT ce_player_game_logs_src.player_id,
            ce_player_game_logs_src.game_id,
            ce_player_game_logs_src.game_date,
            ce_player_game_logs_src.pts,
            row_number() OVER (PARTITION BY ce_player_game_logs_src.player_id ORDER BY ce_player_game_logs_src.game_date DESC, ce_player_game_logs_src.game_id DESC) AS rn
           FROM ce_player_game_logs_src
          WHERE ce_player_game_logs_src.game_date < CURRENT_DATE
        ), season_stats AS (
         SELECT ranked.player_id,
            avg(ranked.pts) AS season_pts
           FROM ranked
          GROUP BY ranked.player_id
        ), last5 AS (
         SELECT ranked.player_id,
            avg(ranked.pts) AS last5_pts
           FROM ranked
          WHERE ranked.rn <= 5
          GROUP BY ranked.player_id
        ), last10 AS (
         SELECT ranked.player_id,
            avg(ranked.pts) AS last10_pts
           FROM ranked
          WHERE ranked.rn <= 10
          GROUP BY ranked.player_id
        )
 SELECT s.player_id,
    'PTS'::text AS stat_key,
    l5.last5_pts AS last_5_avg,
    l10.last10_pts AS last_10_avg,
    s.season_pts AS season_avg,
    COALESCE(l5.last5_pts, 0::numeric) - COALESCE(s.season_pts, 0::numeric) AS momentum_score
   FROM season_stats s
     LEFT JOIN last5 l5 ON l5.player_id = s.player_id
     LEFT JOIN last10 l10 ON l10.player_id = s.player_id;

CREATE OR REPLACE VIEW public.ce_scorecards_fast AS
 WITH ranked AS (
         SELECT ce_player_game_logs_src.player_id,
            ce_player_game_logs_src.game_id,
            ce_player_game_logs_src.game_date,
            ce_player_game_logs_src.pts,
            ce_player_game_logs_src.reb,
            ce_player_game_logs_src.ast,
            ce_player_game_logs_src.fg3m,
            ce_player_game_logs_src.stl,
            ce_player_game_logs_src.blk,
            ce_player_game_logs_src.tov,
            ce_player_game_logs_src.plus_minus,
            ce_player_game_logs_src.pie,
            row_number() OVER (PARTITION BY ce_player_game_logs_src.player_id ORDER BY ce_player_game_logs_src.game_date DESC, ce_player_game_logs_src.game_id DESC) AS rn
           FROM ce_player_game_logs_src
          WHERE ce_player_game_logs_src.game_date < CURRENT_DATE
        ), sample AS (
         SELECT ranked.player_id,
            ranked.game_id,
            ranked.game_date,
            ranked.pts,
            ranked.reb,
            ranked.ast,
            ranked.fg3m,
            ranked.stl,
            ranked.blk,
            ranked.tov,
            ranked.plus_minus,
            ranked.pie,
            ranked.rn
           FROM ranked
          WHERE ranked.rn <= 10
        ), agg AS (
         SELECT sample.player_id,
            avg(sample.pts) AS pts_mean,
            avg(sample.reb) AS reb_mean,
            avg(sample.ast) AS ast_mean,
            avg(sample.fg3m) AS fg3m_mean,
            avg(sample.stl) AS stl_mean,
            avg(sample.blk) AS blk_mean,
            avg(sample.tov) AS tov_mean,
            avg(COALESCE(sample.pts, 0::numeric) + COALESCE(sample.reb, 0::numeric) + COALESCE(sample.ast, 0::numeric)) AS pra_mean,
            stddev_samp(sample.pts) AS pts_std,
            stddev_samp(sample.reb) AS reb_std,
            stddev_samp(sample.ast) AS ast_std,
            stddev_samp(sample.fg3m) AS fg3m_std,
            stddev_samp(sample.stl) AS stl_std,
            stddev_samp(sample.blk) AS blk_std,
            stddev_samp(sample.tov) AS tov_std,
            stddev_samp(COALESCE(sample.pts, 0::numeric) + COALESCE(sample.reb, 0::numeric) + COALESCE(sample.ast, 0::numeric)) AS pra_std,
            avg(COALESCE(sample.plus_minus, 0::numeric)) AS plus_minus_mean,
            avg(COALESCE(sample.pie, 0::numeric)) AS pie_mean
           FROM sample
          GROUP BY sample.player_id
        ), props_with_proj AS (
         SELECT p.id AS prop_id,
            p.game_key,
            p.game_date,
            p.player_name,
            p.model_player_id AS player_id,
            p.stat_key,
            p.line_value,
            p.over_odds,
            p.under_odds,
            p.provider,
            p.vendor,
            a.plus_minus_mean,
            a.pie_mean,
                CASE
                    WHEN p.stat_key = 'PTS'::text THEN a.pts_mean
                    WHEN p.stat_key = 'REB'::text THEN a.reb_mean
                    WHEN p.stat_key = 'AST'::text THEN a.ast_mean
                    WHEN p.stat_key = 'FG3M'::text THEN a.fg3m_mean
                    WHEN p.stat_key = 'STL'::text THEN a.stl_mean
                    WHEN p.stat_key = 'BLK'::text THEN a.blk_mean
                    WHEN p.stat_key = 'TOV'::text THEN a.tov_mean
                    WHEN p.stat_key = 'PRA'::text THEN a.pra_mean
                    WHEN p.stat_key = 'PR'::text THEN COALESCE(a.pts_mean, 0::numeric) + COALESCE(a.reb_mean, 0::numeric)
                    WHEN p.stat_key = 'PA'::text THEN COALESCE(a.pts_mean, 0::numeric) + COALESCE(a.ast_mean, 0::numeric)
                    WHEN p.stat_key = 'RA'::text THEN COALESCE(a.reb_mean, 0::numeric) + COALESCE(a.ast_mean, 0::numeric)
                    ELSE NULL::numeric
                END AS projection_mean,
                CASE
                    WHEN p.stat_key = 'PTS'::text THEN COALESCE(a.pts_std, 6.0)
                    WHEN p.stat_key = 'REB'::text THEN COALESCE(a.reb_std, 3.0)
                    WHEN p.stat_key = 'AST'::text THEN COALESCE(a.ast_std, 2.5)
                    WHEN p.stat_key = 'FG3M'::text THEN COALESCE(a.fg3m_std, 1.5)
                    WHEN p.stat_key = 'STL'::text THEN COALESCE(a.stl_std, 0.9)
                    WHEN p.stat_key = 'BLK'::text THEN COALESCE(a.blk_std, 0.9)
                    WHEN p.stat_key = 'TOV'::text THEN COALESCE(a.tov_std, 1.3)
                    WHEN p.stat_key = 'PRA'::text THEN COALESCE(a.pra_std, 8.0)
                    WHEN p.stat_key = 'PR'::text THEN sqrt(power(COALESCE(a.pts_std, 6.0), 2::numeric) + power(COALESCE(a.reb_std, 3.0), 2::numeric))
                    WHEN p.stat_key = 'PA'::text THEN sqrt(power(COALESCE(a.pts_std, 6.0), 2::numeric) + power(COALESCE(a.ast_std, 2.5), 2::numeric))
                    WHEN p.stat_key = 'RA'::text THEN sqrt(power(COALESCE(a.reb_std, 3.0), 2::numeric) + power(COALESCE(a.ast_std, 2.5), 2::numeric))
                    ELSE NULL::numeric
                END AS std_dev
           FROM ce_props_norm p
             JOIN agg a ON a.player_id = p.model_player_id
          WHERE p.model_player_id IS NOT NULL AND p.line_value IS NOT NULL AND p.game_date = CURRENT_DATE
        )
 SELECT prop_id,
    game_key,
    game_date,
    player_name,
    player_id,
    stat_key,
    line_value,
    projection_mean,
    std_dev,
    plus_minus_mean,
    pie_mean,
    GREATEST(0.90, LEAST(1.10, 1::numeric + (COALESCE(pie_mean, 0::numeric) - 0.10))) AS pie_multiplier,
    1.00 AS astro_multiplier,
    projection_mean * GREATEST(0.90, LEAST(1.10, 1::numeric + (COALESCE(pie_mean, 0::numeric) - 0.10))) * 1.00 AS adjusted_projection,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean * GREATEST(0.90, LEAST(1.10, 1::numeric + (COALESCE(pie_mean, 0::numeric) - 0.10))) * 1.00 - line_value) / NULLIF(std_dev, 0::numeric)))) AS base_prob,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean * GREATEST(0.90, LEAST(1.10, 1::numeric + (COALESCE(pie_mean, 0::numeric) - 0.10))) * 1.00 - line_value) / NULLIF(std_dev, 0::numeric)))) * 100::numeric)::integer AS edge_score,
        CASE
            WHEN (projection_mean * GREATEST(0.90, LEAST(1.10, 1::numeric + (COALESCE(pie_mean, 0::numeric) - 0.10))) * 1.00) >= line_value THEN 'OVER'::text
            ELSE 'UNDER'::text
        END AS lean,
    over_odds,
    under_odds,
    provider,
    vendor
   FROM props_with_proj;

CREATE OR REPLACE VIEW public.ce_scorecards_fast_v2 AS
 SELECT s.prop_id,
    s.game_key,
    s.game_date,
    s.player_name,
    s.player_id,
    s.stat_key,
    s.line_value,
    s.projection_mean,
    s.std_dev,
    s.plus_minus_mean,
    s.pie_mean,
    s.pie_multiplier,
    s.astro_multiplier,
    s.adjusted_projection,
    s.base_prob,
    s.edge_score,
    s.lean,
    s.over_odds,
    s.under_odds,
    s.provider,
    s.vendor,
    m.momentum_score,
    GREATEST(0.90, LEAST(1.10, 1::numeric + COALESCE(m.momentum_score, 0::numeric) * 0.02)) AS momentum_multiplier,
    s.adjusted_projection * GREATEST(0.90, LEAST(1.10, 1::numeric + COALESCE(m.momentum_score, 0::numeric) * 0.02)) AS adjusted_projection_v2,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection * GREATEST(0.90, LEAST(1.10, 1::numeric + COALESCE(m.momentum_score, 0::numeric) * 0.02)) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) AS base_prob_v2,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection * GREATEST(0.90, LEAST(1.10, 1::numeric + COALESCE(m.momentum_score, 0::numeric) * 0.02)) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) * 100::numeric)::integer AS edge_score_v2
   FROM ce_scorecards_fast s
     LEFT JOIN ce_momentum_live m ON m.player_id = s.player_id AND m.stat_key =
        CASE
            WHEN s.stat_key = 'PTS'::text THEN 'PTS'::text
            ELSE 'PTS'::text
        END;

CREATE OR REPLACE VIEW public.ce_astro_live AS
 SELECT game_key,
    player_id,
    1.00 AS astro_mean_multiplier,
    1.00 AS astro_conf_multiplier,
    'neutral'::text AS astro_tone
   FROM ce_scorecards_fast_v2 p;

CREATE OR REPLACE VIEW public.ce_scorecards_fast_v3 AS
 SELECT s.prop_id,
    s.game_key,
    s.game_date,
    s.player_name,
    s.player_id,
    s.stat_key,
    s.line_value,
    s.projection_mean,
    s.std_dev,
    s.plus_minus_mean,
    s.pie_mean,
    s.pie_multiplier,
    s.astro_multiplier,
    s.adjusted_projection,
    s.base_prob,
    s.edge_score,
    s.lean,
    s.over_odds,
    s.under_odds,
    s.provider,
    s.vendor,
    s.momentum_score,
    s.momentum_multiplier,
    s.adjusted_projection_v2,
    s.base_prob_v2,
    s.edge_score_v2,
    a.astro_mean_multiplier,
    a.astro_conf_multiplier,
    a.astro_tone,
    s.adjusted_projection_v2 * COALESCE(a.astro_mean_multiplier, 1.00) AS adjusted_projection_v3,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v2 * COALESCE(a.astro_mean_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) AS base_prob_v3,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v2 * COALESCE(a.astro_mean_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) * COALESCE(a.astro_conf_multiplier, 1.00) * 100::numeric)::integer AS edge_score_v3
   FROM ce_scorecards_fast_v2 s
     LEFT JOIN ce_astro_live a ON a.game_key = s.game_key AND a.player_id = s.player_id;

CREATE OR REPLACE VIEW public.ce_streaks_live AS
 WITH props_base AS (
         SELECT p_1.id AS prop_id,
            p_1.model_player_id AS player_id,
            p_1.player_name,
            p_1.stat_key,
            p_1.line_value
           FROM ce_props_norm p_1
          WHERE p_1.model_player_id IS NOT NULL AND p_1.line_value IS NOT NULL AND p_1.game_date = CURRENT_DATE
        ), hist AS (
         SELECT pb.prop_id,
            pb.player_id,
            pb.stat_key,
            pb.line_value,
            g.game_id,
            g.game_date,
                CASE
                    WHEN pb.stat_key = 'PTS'::text THEN g.pts
                    WHEN pb.stat_key = 'REB'::text THEN g.reb
                    WHEN pb.stat_key = 'AST'::text THEN g.ast
                    WHEN pb.stat_key = 'FG3M'::text THEN g.fg3m
                    WHEN pb.stat_key = 'STL'::text THEN g.stl
                    WHEN pb.stat_key = 'BLK'::text THEN g.blk
                    WHEN pb.stat_key = 'TOV'::text THEN g.tov
                    WHEN pb.stat_key = 'PRA'::text THEN COALESCE(g.pts, 0::numeric) + COALESCE(g.reb, 0::numeric) + COALESCE(g.ast, 0::numeric)
                    WHEN pb.stat_key = 'PR'::text THEN COALESCE(g.pts, 0::numeric) + COALESCE(g.reb, 0::numeric)
                    WHEN pb.stat_key = 'PA'::text THEN COALESCE(g.pts, 0::numeric) + COALESCE(g.ast, 0::numeric)
                    WHEN pb.stat_key = 'RA'::text THEN COALESCE(g.reb, 0::numeric) + COALESCE(g.ast, 0::numeric)
                    ELSE NULL::numeric
                END AS actual_value,
            row_number() OVER (PARTITION BY pb.prop_id ORDER BY g.game_date DESC, g.game_id DESC) AS rn
           FROM props_base pb
             JOIN ce_player_game_logs_src g ON g.player_id = pb.player_id AND g.game_date < CURRENT_DATE
        ), last10 AS (
         SELECT hist.prop_id,
            hist.player_id,
            hist.stat_key,
            hist.line_value,
            hist.game_id,
            hist.game_date,
            hist.actual_value,
            hist.rn
           FROM hist
          WHERE hist.rn <= 10
        ), agg AS (
         SELECT last10.prop_id,
            count(*) FILTER (WHERE last10.actual_value > last10.line_value) AS over_hits_10,
            count(*) FILTER (WHERE last10.actual_value < last10.line_value) AS under_hits_10,
            count(*) FILTER (WHERE last10.rn <= 5 AND last10.actual_value > last10.line_value) AS over_hits_5,
            count(*) FILTER (WHERE last10.rn <= 5 AND last10.actual_value < last10.line_value) AS under_hits_5
           FROM last10
          GROUP BY last10.prop_id
        )
 SELECT p.prop_id,
    p.player_name,
    p.player_id,
    p.stat_key,
    p.line_value,
    a.over_hits_10,
    a.under_hits_10,
    a.over_hits_5,
    a.under_hits_5,
        CASE
            WHEN a.over_hits_5 >= 4 THEN 'OVER_HEATER'::text
            WHEN a.under_hits_5 >= 4 THEN 'UNDER_HEATER'::text
            WHEN a.over_hits_10 >= 7 THEN 'OVER_TREND'::text
            WHEN a.under_hits_10 >= 7 THEN 'UNDER_TREND'::text
            ELSE 'NEUTRAL'::text
        END AS streak_flag,
        CASE
            WHEN a.over_hits_5 >= 4 THEN 1.06
            WHEN a.under_hits_5 >= 4 THEN 0.94
            WHEN a.over_hits_10 >= 7 THEN 1.03
            WHEN a.under_hits_10 >= 7 THEN 0.97
            ELSE 1.00
        END AS streak_multiplier
   FROM props_base p
     LEFT JOIN agg a ON a.prop_id = p.prop_id;

CREATE OR REPLACE VIEW public.ce_scorecards_fast_v4 AS
 SELECT s.prop_id,
    s.game_key,
    s.game_date,
    COALESCE(st.player_name, s.player_name) AS player_name,
    s.player_id,
    s.stat_key,
    s.line_value,
    s.projection_mean,
    s.std_dev,
    s.plus_minus_mean,
    s.pie_mean,
    s.pie_multiplier,
    s.astro_mean_multiplier,
    s.astro_conf_multiplier,
    s.astro_tone,
    s.momentum_score,
    s.momentum_multiplier,
    st.streak_flag,
    st.streak_multiplier,
    s.adjusted_projection_v3 * COALESCE(st.streak_multiplier, 1.00) AS adjusted_projection_v4,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v3 * COALESCE(st.streak_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) AS base_prob_v4,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v3 * COALESCE(st.streak_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) * 100::numeric)::integer AS edge_score_v4,
    s.over_odds,
    s.under_odds,
    s.provider,
    s.vendor
   FROM ce_scorecards_fast_v3 s
     LEFT JOIN ce_streaks_live st ON st.prop_id = s.prop_id;

CREATE OR REPLACE VIEW public.ce_injury_ripple AS
 WITH team_missing AS (
         SELECT ce_injury_status.team_id,
            sum(COALESCE(ce_injury_status.usage_impact, 0::numeric)) AS missing_usage
           FROM ce_injury_status
          WHERE ce_injury_status.status = ANY (ARRAY['OUT'::text, 'DOUBTFUL'::text])
          GROUP BY ce_injury_status.team_id
        )
 SELECT p.prop_id,
    p.player_id,
    COALESCE(t.missing_usage, 0::numeric) AS missing_usage,
        CASE
            WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.30 THEN 1.10
            WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.20 THEN 1.07
            WHEN COALESCE(t.missing_usage, 0::numeric) >= 0.10 THEN 1.04
            ELSE 1.00
        END AS injury_multiplier
   FROM ce_scorecards_fast_v4 p
     LEFT JOIN team_missing t ON t.team_id = p.player_id;

CREATE OR REPLACE VIEW public.ce_scorecards_fast_v5 AS
 SELECT s.prop_id,
    s.game_key,
    s.game_date,
    s.player_name,
    s.player_id,
    s.stat_key,
    s.line_value,
    s.projection_mean,
    s.std_dev,
    s.plus_minus_mean,
    s.pie_mean,
    s.pie_multiplier,
    s.astro_mean_multiplier,
    s.astro_conf_multiplier,
    s.astro_tone,
    s.momentum_score,
    s.momentum_multiplier,
    s.streak_flag,
    s.streak_multiplier,
    s.adjusted_projection_v4,
    s.base_prob_v4,
    s.edge_score_v4,
    s.over_odds,
    s.under_odds,
    s.provider,
    s.vendor,
    ir.injury_multiplier,
    s.adjusted_projection_v4 * COALESCE(ir.injury_multiplier, 1.00) AS adjusted_projection_v5,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v4 * COALESCE(ir.injury_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) AS base_prob_v5,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v4 * COALESCE(ir.injury_multiplier, 1.00) - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) * 100::numeric)::integer AS edge_score_v5
   FROM ce_scorecards_fast_v4 s
     LEFT JOIN ce_injury_ripple ir ON ir.prop_id = s.prop_id;

CREATE OR REPLACE VIEW public.ce_scorecards_top AS
 SELECT player_name,
    player_id,
    game_key,
    stat_key,
    line_value,
    adjusted_projection_v3,
    edge_score_v3,
    astro_tone,
    over_odds,
    under_odds,
    provider,
    vendor
   FROM ce_scorecards_fast_v3
  WHERE (stat_key = ANY (ARRAY['PTS'::text, 'REB'::text, 'AST'::text, 'PRA'::text, 'FG3M'::text])) AND edge_score_v3 >= 55;

CREATE OR REPLACE VIEW public.ce_scorecards_live AS
 WITH ranked AS (
         SELECT ce_player_game_logs_src.player_id,
            ce_player_game_logs_src.game_id,
            ce_player_game_logs_src.game_date,
            ce_player_game_logs_src.pts,
            ce_player_game_logs_src.reb,
            ce_player_game_logs_src.ast,
            ce_player_game_logs_src.fg3m,
            ce_player_game_logs_src.stl,
            ce_player_game_logs_src.blk,
            ce_player_game_logs_src.tov,
            row_number() OVER (PARTITION BY ce_player_game_logs_src.player_id ORDER BY ce_player_game_logs_src.game_date DESC, ce_player_game_logs_src.game_id DESC) AS rn
           FROM ce_player_game_logs_src
          WHERE ce_player_game_logs_src.game_date < CURRENT_DATE
        ), sample AS (
         SELECT ranked.player_id,
            ranked.game_id,
            ranked.game_date,
            ranked.pts,
            ranked.reb,
            ranked.ast,
            ranked.fg3m,
            ranked.stl,
            ranked.blk,
            ranked.tov,
            ranked.rn
           FROM ranked
          WHERE ranked.rn <= 10
        ), agg AS (
         SELECT sample.player_id,
            avg(sample.pts) AS pts_mean,
            avg(sample.reb) AS reb_mean,
            avg(sample.ast) AS ast_mean,
            avg(sample.fg3m) AS fg3m_mean,
            avg(sample.stl) AS stl_mean,
            avg(sample.blk) AS blk_mean,
            avg(sample.tov) AS tov_mean,
            avg(COALESCE(sample.pts, 0::numeric) + COALESCE(sample.reb, 0::numeric) + COALESCE(sample.ast, 0::numeric)) AS pra_mean,
            stddev_samp(sample.pts) AS pts_std,
            stddev_samp(sample.reb) AS reb_std,
            stddev_samp(sample.ast) AS ast_std,
            stddev_samp(sample.fg3m) AS fg3m_std,
            stddev_samp(sample.stl) AS stl_std,
            stddev_samp(sample.blk) AS blk_std,
            stddev_samp(sample.tov) AS tov_std,
            stddev_samp(COALESCE(sample.pts, 0::numeric) + COALESCE(sample.reb, 0::numeric) + COALESCE(sample.ast, 0::numeric)) AS pra_std
           FROM sample
          GROUP BY sample.player_id
        ), props_with_proj AS (
         SELECT p.id AS prop_id,
            p.game_key,
            p.game_date,
            p.player_name,
            p.model_player_id AS player_id,
            p.stat_key,
            p.line_value,
            p.over_odds,
            p.under_odds,
            p.provider,
            p.vendor,
                CASE
                    WHEN p.stat_key = 'PTS'::text THEN a.pts_mean
                    WHEN p.stat_key = 'REB'::text THEN a.reb_mean
                    WHEN p.stat_key = 'AST'::text THEN a.ast_mean
                    WHEN p.stat_key = 'FG3M'::text THEN a.fg3m_mean
                    WHEN p.stat_key = 'STL'::text THEN a.stl_mean
                    WHEN p.stat_key = 'BLK'::text THEN a.blk_mean
                    WHEN p.stat_key = 'TOV'::text THEN a.tov_mean
                    WHEN p.stat_key = 'PRA'::text THEN a.pra_mean
                    WHEN p.stat_key = 'PR'::text THEN COALESCE(a.pts_mean, 0::numeric) + COALESCE(a.reb_mean, 0::numeric)
                    WHEN p.stat_key = 'PA'::text THEN COALESCE(a.pts_mean, 0::numeric) + COALESCE(a.ast_mean, 0::numeric)
                    WHEN p.stat_key = 'RA'::text THEN COALESCE(a.reb_mean, 0::numeric) + COALESCE(a.ast_mean, 0::numeric)
                    ELSE NULL::numeric
                END AS projection_mean,
                CASE
                    WHEN p.stat_key = 'PTS'::text THEN COALESCE(a.pts_std, 6.0)
                    WHEN p.stat_key = 'REB'::text THEN COALESCE(a.reb_std, 3.0)
                    WHEN p.stat_key = 'AST'::text THEN COALESCE(a.ast_std, 2.5)
                    WHEN p.stat_key = 'FG3M'::text THEN COALESCE(a.fg3m_std, 1.5)
                    WHEN p.stat_key = 'STL'::text THEN COALESCE(a.stl_std, 0.9)
                    WHEN p.stat_key = 'BLK'::text THEN COALESCE(a.blk_std, 0.9)
                    WHEN p.stat_key = 'TOV'::text THEN COALESCE(a.tov_std, 1.3)
                    WHEN p.stat_key = 'PRA'::text THEN COALESCE(a.pra_std, 8.0)
                    WHEN p.stat_key = 'PR'::text THEN sqrt(power(COALESCE(a.pts_std, 6.0), 2::numeric) + power(COALESCE(a.reb_std, 3.0), 2::numeric))
                    WHEN p.stat_key = 'PA'::text THEN sqrt(power(COALESCE(a.pts_std, 6.0), 2::numeric) + power(COALESCE(a.ast_std, 2.5), 2::numeric))
                    WHEN p.stat_key = 'RA'::text THEN sqrt(power(COALESCE(a.reb_std, 3.0), 2::numeric) + power(COALESCE(a.ast_std, 2.5), 2::numeric))
                    ELSE NULL::numeric
                END AS std_dev
           FROM ce_props_norm p
             JOIN agg a ON a.player_id = p.model_player_id
          WHERE p.model_player_id IS NOT NULL AND p.line_value IS NOT NULL AND p.game_date = CURRENT_DATE
        )
 SELECT prop_id,
    game_key,
    game_date,
    player_name,
    player_id,
    stat_key,
    line_value,
    projection_mean,
    std_dev,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean - line_value) / NULLIF(std_dev, 0::numeric)))) AS base_prob,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean - line_value) / NULLIF(std_dev, 0::numeric)))) * 0.95 * 100::numeric)::integer AS edge_score,
        CASE
            WHEN projection_mean >= line_value THEN 'OVER'::text
            ELSE 'UNDER'::text
        END AS lean,
        CASE
            WHEN round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean - line_value) / NULLIF(std_dev, 0::numeric)))) * 0.95 * 100::numeric) >= 70::numeric THEN 'Safe'::text
            WHEN round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean - line_value) / NULLIF(std_dev, 0::numeric)))) * 0.95 * 100::numeric) >= 55::numeric THEN 'Standard'::text
            WHEN round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((projection_mean - line_value) / NULLIF(std_dev, 0::numeric)))) * 0.95 * 100::numeric) >= 40::numeric THEN 'Spicy'::text
            ELSE 'Avoid'::text
        END AS risk_label,
    over_odds,
    under_odds,
    provider,
    vendor
   FROM props_with_proj;