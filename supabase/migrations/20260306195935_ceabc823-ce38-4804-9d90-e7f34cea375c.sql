-- BATCH 4: ASTRO OVERRIDE LAYER
create table if not exists public.ce_astro_overrides (
  player_id bigint primary key,
  astro_mean_multiplier numeric default 1.00,
  astro_conf_multiplier numeric default 1.00,
  astro_tone text default 'neutral',
  mars_boost numeric default 0.00,
  mercury_chaos numeric default 0.00,
  saturn_clamp numeric default 0.00,
  jupiter_lift numeric default 0.00,
  neptune_fog numeric default 0.00,
  sky_noise text default 'neutral',
  note text,
  updated_at timestamptz default now()
);

create or replace view public.ce_scorecards_fast_v7 as
select
  s.player_name,
  s.player_id,
  s.game_key,
  s.stat_key,
  s.line_value,
  s.projection_mean,
  s.std_dev,
  s.plus_minus_mean,
  s.pie_mean,
  s.pie_multiplier,
  s.momentum_score,
  s.momentum_multiplier,
  s.streak_flag,
  s.streak_multiplier,
  s.injury_multiplier,
  s.matchup_multiplier,
  coalesce(ao.astro_mean_multiplier, 1.00) as astro_mean_multiplier_real,
  coalesce(ao.astro_conf_multiplier, 1.00) as astro_conf_multiplier_real,
  coalesce(ao.astro_tone, 'neutral') as astro_tone_real,
  coalesce(ao.mars_boost, 0.00) as mars_boost,
  coalesce(ao.mercury_chaos, 0.00) as mercury_chaos,
  coalesce(ao.saturn_clamp, 0.00) as saturn_clamp,
  coalesce(ao.jupiter_lift, 0.00) as jupiter_lift,
  coalesce(ao.neptune_fog, 0.00) as neptune_fog,
  coalesce(ao.sky_noise, 'neutral') as sky_noise,
  s.adjusted_projection_v6
    * coalesce(ao.astro_mean_multiplier, 1.00)
    as adjusted_projection_v7,
  (
    s.std_dev
    * case
        when coalesce(ao.sky_noise, 'neutral') = 'low' then 0.95
        when coalesce(ao.sky_noise, 'neutral') = 'high' then 1.08
        else 1.00
      end
    * (1 + abs(coalesce(ao.mercury_chaos, 0.00)))
    * (1 + abs(coalesce(ao.neptune_fog, 0.00)) * 0.50)
  )::numeric as adjusted_std_v7,
  (1 / (1 + exp(-1.6 * ((
    s.adjusted_projection_v6
      * coalesce(ao.astro_mean_multiplier, 1.00)
    - s.line_value
  ) / nullif(
    (
      s.std_dev
      * case
          when coalesce(ao.sky_noise, 'neutral') = 'low' then 0.95
          when coalesce(ao.sky_noise, 'neutral') = 'high' then 1.08
          else 1.00
        end
      * (1 + abs(coalesce(ao.mercury_chaos, 0.00)))
      * (1 + abs(coalesce(ao.neptune_fog, 0.00)) * 0.50)
    ), 0
  )))))::numeric as base_prob_v7,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v6
        * coalesce(ao.astro_mean_multiplier, 1.00)
      - s.line_value
    ) / nullif(
      (
        s.std_dev
        * case
            when coalesce(ao.sky_noise, 'neutral') = 'low' then 0.95
            when coalesce(ao.sky_noise, 'neutral') = 'high' then 1.08
            else 1.00
          end
        * (1 + abs(coalesce(ao.mercury_chaos, 0.00)))
        * (1 + abs(coalesce(ao.neptune_fog, 0.00)) * 0.50)
      ), 0
    )))))
    * coalesce(ao.astro_conf_multiplier, 1.00)
    * 100
  )::int as edge_score_v7,
  case
    when (s.adjusted_projection_v6 * coalesce(ao.astro_mean_multiplier, 1.00)) >= s.line_value
    then 'OVER'
    else 'UNDER'
  end as lean_v7,
  s.over_odds,
  s.under_odds,
  s.provider,
  s.vendor
from public.ce_scorecards_fast_v6 s
left join public.ce_astro_overrides ao
  on ao.player_id = s.player_id;

create or replace view public.ce_scorecards_top_v4 as
select
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v7, adjusted_std_v7, edge_score_v7, lean_v7,
  streak_flag, injury_multiplier, matchup_multiplier,
  astro_tone_real, sky_noise, mars_boost, mercury_chaos,
  saturn_clamp, jupiter_lift, neptune_fog,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_fast_v7
where stat_key in ('PTS','REB','AST','PRA','FG3M','PR','PA','RA')
  and edge_score_v7 >= 55;

create or replace view public.ce_scorecards_top_25_v4 as
select *
from public.ce_scorecards_top_v4
order by edge_score_v7 desc nulls last
limit 25;

create or replace view public.ce_monte_input_heavy_v4 as
select
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v7 as projection_mean,
  adjusted_std_v7 as sim_std,
  edge_score_v7, lean_v7, streak_flag,
  injury_multiplier, matchup_multiplier,
  astro_tone_real, sky_noise, mars_boost, mercury_chaos,
  saturn_clamp, jupiter_lift, neptune_fog,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_v4;