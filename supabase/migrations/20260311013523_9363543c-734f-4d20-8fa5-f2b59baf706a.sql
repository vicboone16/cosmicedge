
-- Drop in dependency order: shift depends on both baseline and spikes
DROP VIEW IF EXISTS public.ce_usage_shift;
DROP VIEW IF EXISTS public.ce_usage_baseline;
DROP VIEW IF EXISTS public.ce_usage_spikes;

-- Recreate spikes
CREATE VIEW public.ce_usage_spikes AS
SELECT player_id,
    avg(((pts + reb) + ast)) AS avg_pra_10,
    avg(pie) AS avg_pie_10
FROM ce_player_game_logs_src
WHERE (game_date >= (CURRENT_DATE - '10 days'::interval))
GROUP BY player_id;

-- Recreate baseline
CREATE VIEW public.ce_usage_baseline AS
SELECT player_id,
    avg(((pts + reb) + ast)) AS avg_pra_season,
    avg(pie) AS avg_pie_season
FROM ce_player_game_logs_src
WHERE (game_date >= (CURRENT_DATE - '120 days'::interval))
GROUP BY player_id;

-- Recreate shift (depends on both)
CREATE VIEW public.ce_usage_shift AS
SELECT s.player_id,
    s.avg_pra_10,
    b.avg_pra_season,
    CASE
        WHEN (s.avg_pra_10 > (b.avg_pra_season * 1.20)) THEN 1.10
        WHEN (s.avg_pra_10 > (b.avg_pra_season * 1.10)) THEN 1.05
        ELSE 1.00
    END AS ripple_multiplier_auto
FROM (ce_usage_spikes s
    JOIN ce_usage_baseline b ON ((s.player_id = b.player_id)));
