-- Re-declare existing views with CREATE OR REPLACE to prevent DROP conflicts
-- Then create missing views in the chain: v6 → top_v3 → top_25 → top_heavy

-- v4: CREATE OR REPLACE to sync shadow ↔ live (same definition)
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
FROM public.ce_scorecards_fast_v3 s
LEFT JOIN public.ce_streaks_live st ON st.prop_id = s.prop_id;

-- injury_ripple: CREATE OR REPLACE (same definition)
CREATE OR REPLACE VIEW public.ce_injury_ripple AS
WITH team_missing AS (
    SELECT ce_injury_status.team_id,
        sum(COALESCE(ce_injury_status.usage_impact, 0::numeric)) AS missing_usage
    FROM public.ce_injury_status
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
FROM public.ce_scorecards_fast_v4 p
LEFT JOIN team_missing t ON t.team_id = p.player_id;

-- v5: CREATE OR REPLACE (same definition)
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
FROM public.ce_scorecards_fast_v4 s
LEFT JOIN public.ce_injury_ripple ir ON ir.prop_id = s.prop_id;

-- v6: NEW — adds matchup_multiplier (defaults to 1.00, ready for future enhancement)
CREATE OR REPLACE VIEW public.ce_scorecards_fast_v6 AS
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
    s.edge_score_v4,
    s.injury_multiplier,
    s.adjusted_projection_v5,
    s.edge_score_v5,
    1.00::numeric AS matchup_multiplier,
    s.adjusted_projection_v5 * 1.00 AS adjusted_projection_v6,
    1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v5 * 1.00 - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) AS base_prob_v6,
    round(1::numeric / (1::numeric + exp('-1.6'::numeric * ((s.adjusted_projection_v5 * 1.00 - s.line_value) / NULLIF(s.std_dev, 0::numeric)))) * 100::numeric)::integer AS edge_score_v6,
    s.over_odds,
    s.under_odds,
    s.provider,
    s.vendor
FROM public.ce_scorecards_fast_v5 s;

-- top_v3: filtered v6 for main stat categories with edge >= 55
CREATE OR REPLACE VIEW public.ce_scorecards_top_v3 AS
SELECT player_name,
    player_id,
    game_key,
    stat_key,
    line_value,
    adjusted_projection_v6,
    edge_score_v6,
    streak_flag,
    injury_multiplier,
    matchup_multiplier,
    astro_tone,
    over_odds,
    under_odds,
    provider,
    vendor
FROM public.ce_scorecards_fast_v6
WHERE stat_key IN ('PTS','REB','AST','PRA','FG3M','PR','PA','RA')
  AND edge_score_v6 >= 55;

-- top_25: top 25 by edge score
CREATE OR REPLACE VIEW public.ce_scorecards_top_25 AS
SELECT *
FROM public.ce_scorecards_top_v3
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 25;

-- top_heavy: broader set, limit 50
CREATE OR REPLACE VIEW public.ce_scorecards_top_heavy AS
SELECT player_name,
    player_id,
    game_key,
    stat_key,
    line_value,
    adjusted_projection_v6,
    edge_score_v6,
    streak_flag,
    injury_multiplier,
    matchup_multiplier,
    astro_tone,
    over_odds,
    under_odds,
    provider,
    vendor
FROM public.ce_scorecards_fast_v6
WHERE stat_key IN ('PTS','REB','AST','PRA','FG3M','PR','PA','RA')
  AND edge_score_v6 >= 55
ORDER BY edge_score_v6 DESC NULLS LAST
LIMIT 50;