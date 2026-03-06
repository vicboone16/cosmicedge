
-- =====================================================
-- COSMICEDGE SAFE RECOVERY / MIGRATION PACK
-- Drop all CE views in reverse dependency order, then rebuild
-- =====================================================

-- Drop downstream first
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel_top_plays CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_correlation_flags CASCADE;
DROP VIEW IF EXISTS public.ce_stat_correlations CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v9 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v8 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v7 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v6 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_streaks_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v3 CASCADE;
DROP VIEW IF EXISTS public.ce_astro_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v2 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast CASCADE;
DROP VIEW IF EXISTS public.ce_momentum_live CASCADE;
DROP VIEW IF EXISTS public.ce_defense_difficulty CASCADE;
DROP VIEW IF EXISTS public.ce_usage_shift CASCADE;
DROP VIEW IF EXISTS public.ce_usage_baseline CASCADE;
DROP VIEW IF EXISTS public.ce_usage_spikes CASCADE;
DROP VIEW IF EXISTS public.ce_player_current_team CASCADE;
-- Also drop old broken references
DROP VIEW IF EXISTS public.ce_scorecards_top_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v4 CASCADE;

-- 0) SAFE HELPER
create or replace function public.ce_randn()
returns double precision
language sql
volatile
as $$
select sqrt(-2.0 * ln(greatest(1e-12, random())))
     * cos(2.0 * pi() * random());
$$;

-- 1) OPTIONAL SAFE TABLES
create table if not exists public.ce_injury_overrides (
  player_id bigint primary key,
  injury_multiplier numeric default 1.00,
  note text,
  updated_at timestamptz default now()
);

create table if not exists public.ce_matchup_overrides (
  player_id bigint,
  stat_key text,
  matchup_multiplier numeric default 1.00,
  note text,
  updated_at timestamptz default now(),
  primary key (player_id, stat_key)
);

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

-- 2) MOMENTUM
create or replace view public.ce_momentum_live as
with ranked as (
  select
    player_id, game_id, game_date, pts,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src
  where game_date < current_date
),
season_stats as (
  select player_id, avg(pts) as season_pts from ranked group by player_id
),
last5 as (
  select player_id, avg(pts) as last5_pts from ranked where rn <= 5 group by player_id
),
last10 as (
  select player_id, avg(pts) as last10_pts from ranked where rn <= 10 group by player_id
)
select
  s.player_id,
  'PTS'::text as stat_key,
  l5.last5_pts as last_5_avg,
  l10.last10_pts as last_10_avg,
  s.season_pts as season_avg,
  coalesce(l5.last5_pts,0) - coalesce(s.season_pts,0) as momentum_score
from season_stats s
left join last5 l5 on l5.player_id = s.player_id
left join last10 l10 on l10.player_id = s.player_id;

-- 3) BASE SCORECARDS
create or replace view public.ce_scorecards_fast as
with ranked as (
  select
    player_id, game_id, game_date, pts, reb, ast, fg3m, stl, blk, tov, plus_minus, pie,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src
  where game_date < current_date
),
sample as (select * from ranked where rn <= 10),
agg as (
  select
    player_id,
    avg(pts) as pts_mean, avg(reb) as reb_mean, avg(ast) as ast_mean,
    avg(fg3m) as fg3m_mean, avg(stl) as stl_mean, avg(blk) as blk_mean,
    avg(tov) as tov_mean,
    avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_mean,
    stddev_samp(pts) as pts_std, stddev_samp(reb) as reb_std, stddev_samp(ast) as ast_std,
    stddev_samp(fg3m) as fg3m_std, stddev_samp(stl) as stl_std, stddev_samp(blk) as blk_std,
    stddev_samp(tov) as tov_std,
    stddev_samp(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_std,
    avg(coalesce(plus_minus,0)) as plus_minus_mean,
    avg(coalesce(pie,0)) as pie_mean
  from sample group by player_id
),
props_with_proj as (
  select
    p.id as prop_id, p.game_key, p.game_date, p.player_name,
    p.model_player_id as player_id, p.stat_key, p.line_value,
    p.over_odds, p.under_odds, p.provider, p.vendor,
    a.plus_minus_mean, a.pie_mean,
    case
      when p.stat_key = 'PTS' then a.pts_mean
      when p.stat_key = 'REB' then a.reb_mean
      when p.stat_key = 'AST' then a.ast_mean
      when p.stat_key = 'FG3M' then a.fg3m_mean
      when p.stat_key = 'STL' then a.stl_mean
      when p.stat_key = 'BLK' then a.blk_mean
      when p.stat_key = 'TOV' then a.tov_mean
      when p.stat_key = 'PRA' then a.pra_mean
      when p.stat_key = 'PR' then coalesce(a.pts_mean,0)+coalesce(a.reb_mean,0)
      when p.stat_key = 'PA' then coalesce(a.pts_mean,0)+coalesce(a.ast_mean,0)
      when p.stat_key = 'RA' then coalesce(a.reb_mean,0)+coalesce(a.ast_mean,0)
      else null
    end as projection_mean,
    case
      when p.stat_key = 'PTS' then coalesce(a.pts_std,6.0)
      when p.stat_key = 'REB' then coalesce(a.reb_std,3.0)
      when p.stat_key = 'AST' then coalesce(a.ast_std,2.5)
      when p.stat_key = 'FG3M' then coalesce(a.fg3m_std,1.5)
      when p.stat_key = 'STL' then coalesce(a.stl_std,0.9)
      when p.stat_key = 'BLK' then coalesce(a.blk_std,0.9)
      when p.stat_key = 'TOV' then coalesce(a.tov_std,1.3)
      when p.stat_key = 'PRA' then coalesce(a.pra_std,8.0)
      when p.stat_key = 'PR' then sqrt(power(coalesce(a.pts_std,6.0),2)+power(coalesce(a.reb_std,3.0),2))
      when p.stat_key = 'PA' then sqrt(power(coalesce(a.pts_std,6.0),2)+power(coalesce(a.ast_std,2.5),2))
      when p.stat_key = 'RA' then sqrt(power(coalesce(a.reb_std,3.0),2)+power(coalesce(a.ast_std,2.5),2))
      else null
    end as std_dev
  from public.ce_props_norm p
  join agg a on a.player_id = p.model_player_id
  where p.model_player_id is not null
    and p.line_value is not null
    and p.game_date = current_date
)
select
  prop_id, game_key, game_date, player_name, player_id, stat_key, line_value,
  projection_mean, std_dev, plus_minus_mean, pie_mean,
  greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) as pie_multiplier,
  projection_mean * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) as adjusted_projection,
  over_odds, under_odds, provider, vendor
from props_with_proj;

-- 4) V2 MOMENTUM
create or replace view public.ce_scorecards_fast_v2 as
select
  s.*,
  m.momentum_score,
  greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as momentum_multiplier,
  s.adjusted_projection * greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as adjusted_projection_v2
from public.ce_scorecards_fast s
left join public.ce_momentum_live m on m.player_id = s.player_id and m.stat_key = 'PTS';

-- 5) ASTRO PLACEHOLDER
create or replace view public.ce_astro_live as
select p.game_key, p.player_id,
  1.00::numeric as astro_mean_multiplier,
  1.00::numeric as astro_conf_multiplier,
  'neutral'::text as astro_tone
from public.ce_scorecards_fast_v2 p;

create or replace view public.ce_scorecards_fast_v3 as
select
  s.*,
  a.astro_mean_multiplier, a.astro_conf_multiplier, a.astro_tone,
  s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) as adjusted_projection_v3,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) - s.line_value
    ) / nullif(s.std_dev,0))))) * coalesce(a.astro_conf_multiplier,1.00) * 100
  )::int as edge_score_v3
from public.ce_scorecards_fast_v2 s
left join public.ce_astro_live a on a.game_key = s.game_key and a.player_id = s.player_id;

-- 6) STREAKS
create or replace view public.ce_streaks_live as
with props_base as (
  select p.id as prop_id, p.model_player_id as player_id, p.player_name, p.stat_key, p.line_value
  from public.ce_props_norm p
  where p.model_player_id is not null and p.line_value is not null and p.game_date = current_date
),
hist as (
  select
    pb.prop_id, pb.player_id, pb.stat_key, pb.line_value, g.game_id, g.game_date,
    case
      when pb.stat_key = 'PTS' then g.pts
      when pb.stat_key = 'REB' then g.reb
      when pb.stat_key = 'AST' then g.ast
      when pb.stat_key = 'FG3M' then g.fg3m
      when pb.stat_key = 'STL' then g.stl
      when pb.stat_key = 'BLK' then g.blk
      when pb.stat_key = 'TOV' then g.tov
      when pb.stat_key = 'PRA' then coalesce(g.pts,0)+coalesce(g.reb,0)+coalesce(g.ast,0)
      when pb.stat_key = 'PR' then coalesce(g.pts,0)+coalesce(g.reb,0)
      when pb.stat_key = 'PA' then coalesce(g.pts,0)+coalesce(g.ast,0)
      when pb.stat_key = 'RA' then coalesce(g.reb,0)+coalesce(g.ast,0)
      else null
    end as actual_value,
    row_number() over (partition by pb.prop_id order by g.game_date desc, g.game_id desc) as rn
  from props_base pb
  join public.ce_player_game_logs_src g on g.player_id = pb.player_id and g.game_date < current_date
),
last10 as (select * from hist where rn <= 10),
agg as (
  select
    prop_id,
    count(*) filter (where actual_value > line_value) as over_hits_10,
    count(*) filter (where actual_value < line_value) as under_hits_10,
    count(*) filter (where rn <= 5 and actual_value > line_value) as over_hits_5,
    count(*) filter (where rn <= 5 and actual_value < line_value) as under_hits_5
  from last10 group by prop_id
)
select
  p.prop_id, p.player_name, p.player_id, p.stat_key, p.line_value,
  a.over_hits_10, a.under_hits_10, a.over_hits_5, a.under_hits_5,
  case
    when a.over_hits_5 >= 4 then 'OVER_HEATER'
    when a.under_hits_5 >= 4 then 'UNDER_HEATER'
    when a.over_hits_10 >= 7 then 'OVER_TREND'
    when a.under_hits_10 >= 7 then 'UNDER_TREND'
    else 'NEUTRAL'
  end as streak_flag,
  case
    when a.over_hits_5 >= 4 then 1.06
    when a.under_hits_5 >= 4 then 0.94
    when a.over_hits_10 >= 7 then 1.03
    when a.under_hits_10 >= 7 then 0.97
    else 1.00
  end as streak_multiplier
from props_base p
left join agg a on a.prop_id = p.prop_id;

create or replace view public.ce_scorecards_fast_v4 as
select
  s.prop_id, s.game_key, s.game_date,
  coalesce(st.player_name, s.player_name) as player_name,
  s.player_id, s.stat_key, s.line_value, s.projection_mean, s.std_dev,
  s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.astro_mean_multiplier, s.astro_conf_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier,
  st.streak_flag, st.streak_multiplier,
  s.adjusted_projection_v3 * coalesce(st.streak_multiplier,1.00) as adjusted_projection_v4,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v3 * coalesce(st.streak_multiplier,1.00) - s.line_value
    ) / nullif(s.std_dev,0))))) * 100
  )::int as edge_score_v4,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v3 s
left join public.ce_streaks_live st on st.prop_id = s.prop_id;

-- 7) INJURY + MATCHUP OVERRIDES
create or replace view public.ce_scorecards_fast_v5 as
select
  s.*,
  coalesce(io.injury_multiplier, 1.00) as injury_multiplier,
  s.adjusted_projection_v4 * coalesce(io.injury_multiplier, 1.00) as adjusted_projection_v5,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v4 * coalesce(io.injury_multiplier, 1.00) - s.line_value
    ) / nullif(s.std_dev,0))))) * 100
  )::int as edge_score_v5
from public.ce_scorecards_fast_v4 s
left join public.ce_injury_overrides io on io.player_id = s.player_id;

create or replace view public.ce_scorecards_fast_v6 as
select
  s.*,
  coalesce(mo.matchup_multiplier, 1.00) as matchup_multiplier,
  s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) as adjusted_projection_v6,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) - s.line_value
    ) / nullif(s.std_dev,0))))) * 100
  )::int as edge_score_v6
from public.ce_scorecards_fast_v5 s
left join public.ce_matchup_overrides mo on mo.player_id = s.player_id and mo.stat_key = s.stat_key;

-- 8) REAL ASTRO OVERRIDE LAYER
create or replace view public.ce_scorecards_fast_v7 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean, s.pie_multiplier,
  s.momentum_score, s.momentum_multiplier, s.streak_flag, s.streak_multiplier,
  s.injury_multiplier, s.matchup_multiplier,
  coalesce(ao.astro_mean_multiplier, 1.00) as astro_mean_multiplier_real,
  coalesce(ao.astro_conf_multiplier, 1.00) as astro_conf_multiplier_real,
  coalesce(ao.astro_tone, 'neutral') as astro_tone_real,
  coalesce(ao.mars_boost, 0.00) as mars_boost,
  coalesce(ao.mercury_chaos, 0.00) as mercury_chaos,
  coalesce(ao.saturn_clamp, 0.00) as saturn_clamp,
  coalesce(ao.jupiter_lift, 0.00) as jupiter_lift,
  coalesce(ao.neptune_fog, 0.00) as neptune_fog,
  coalesce(ao.sky_noise, 'neutral') as sky_noise,
  s.adjusted_projection_v6 * coalesce(ao.astro_mean_multiplier, 1.00) as adjusted_projection_v7,
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
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v6 * coalesce(ao.astro_mean_multiplier, 1.00) - s.line_value
    ) / nullif(
      (s.std_dev
        * case when coalesce(ao.sky_noise, 'neutral') = 'low' then 0.95
              when coalesce(ao.sky_noise, 'neutral') = 'high' then 1.08
              else 1.00 end
        * (1 + abs(coalesce(ao.mercury_chaos, 0.00)))
        * (1 + abs(coalesce(ao.neptune_fog, 0.00)) * 0.50)
      ),0
    ))))) * coalesce(ao.astro_conf_multiplier,1.00) * 100
  )::int as edge_score_v7,
  case
    when (s.adjusted_projection_v6 * coalesce(ao.astro_mean_multiplier, 1.00)) >= s.line_value
    then 'OVER' else 'UNDER'
  end as lean_v7,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v6 s
left join public.ce_astro_overrides ao on ao.player_id = s.player_id;

-- 9) PLAYER CURRENT TEAM
create or replace view public.ce_player_current_team as
with ranked as (
  select player_id, team_id, game_date, game_id,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src
  where team_id is not null
)
select player_id, team_id from ranked where rn = 1;

-- 10) USAGE SHIFT
create or replace view public.ce_usage_spikes as
select player_id,
  avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as avg_pra_10,
  avg(coalesce(pie,0)) as avg_pie_10
from public.ce_player_game_logs_src
where game_date >= current_date - interval '10 days'
group by player_id;

create or replace view public.ce_usage_baseline as
select player_id,
  avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as avg_pra_season,
  avg(coalesce(pie,0)) as avg_pie_season
from public.ce_player_game_logs_src
where game_date >= current_date - interval '120 days'
group by player_id;

create or replace view public.ce_usage_shift as
select
  s.player_id, s.avg_pra_10, b.avg_pra_season,
  case
    when s.avg_pra_10 > b.avg_pra_season * 1.20 then 1.10
    when s.avg_pra_10 > b.avg_pra_season * 1.10 then 1.05
    when s.avg_pra_10 < b.avg_pra_season * 0.90 then 0.97
    else 1.00
  end as ripple_multiplier_auto
from public.ce_usage_spikes s
join public.ce_usage_baseline b on s.player_id = b.player_id;

-- 11) DEFENSE DIFFICULTY
create or replace view public.ce_defense_difficulty as
with base as (
  select opponent_team_id,
    avg(coalesce(pts,0)) as pts_allowed, avg(coalesce(reb,0)) as reb_allowed,
    avg(coalesce(ast,0)) as ast_allowed, avg(coalesce(fg3m,0)) as fg3m_allowed,
    avg(coalesce(stl,0)) as stl_allowed, avg(coalesce(blk,0)) as blk_allowed,
    avg(coalesce(tov,0)) as tov_allowed,
    avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_allowed
  from public.ce_player_game_logs_src
  where game_date >= current_date - interval '30 days' and opponent_team_id is not null
  group by opponent_team_id
),
league as (
  select
    avg(coalesce(pts,0)) as pts_avg, avg(coalesce(reb,0)) as reb_avg,
    avg(coalesce(ast,0)) as ast_avg, avg(coalesce(fg3m,0)) as fg3m_avg,
    avg(coalesce(stl,0)) as stl_avg, avg(coalesce(blk,0)) as blk_avg,
    avg(coalesce(tov,0)) as tov_avg,
    avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_avg
  from public.ce_player_game_logs_src
  where game_date >= current_date - interval '30 days'
),
unioned as (
  select b.opponent_team_id, 'PTS'::text as stat_key, greatest(0.90, least(1.10, b.pts_allowed / nullif(l.pts_avg,0))) as difficulty_multiplier from base b cross join league l
  union all
  select b.opponent_team_id, 'REB', greatest(0.90, least(1.10, b.reb_allowed / nullif(l.reb_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'AST', greatest(0.90, least(1.10, b.ast_allowed / nullif(l.ast_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'FG3M', greatest(0.90, least(1.10, b.fg3m_allowed / nullif(l.fg3m_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'STL', greatest(0.90, least(1.10, b.stl_allowed / nullif(l.stl_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'BLK', greatest(0.90, least(1.10, b.blk_allowed / nullif(l.blk_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'TOV', greatest(0.90, least(1.10, b.tov_allowed / nullif(l.tov_avg,0))) from base b cross join league l
  union all
  select b.opponent_team_id, 'PRA', greatest(0.90, least(1.10, b.pra_allowed / nullif(l.pra_avg,0))) from base b cross join league l
)
select * from unioned;

-- 12) V8 PASS-THROUGH
create or replace view public.ce_scorecards_fast_v8 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.adjusted_projection_v7 as adjusted_projection_v8,
  s.adjusted_std_v7 as adjusted_std_v8,
  s.edge_score_v7 as edge_score_v8,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v7 s;

-- 13) V9 (usage shift)
create or replace view public.ce_scorecards_fast_v9 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.adjusted_projection_v8 * coalesce(u.ripple_multiplier_auto, 1.00) as projection_v9,
  s.adjusted_std_v8 as std_v9,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v8 * coalesce(u.ripple_multiplier_auto, 1.00) - s.line_value
    ) / nullif(s.adjusted_std_v8,0))))) * 100
  )::int as edge_score_v9,
  coalesce(u.ripple_multiplier_auto, 1.00) as ripple_multiplier_auto,
  1.00::numeric as defense_multiplier,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v8 s
left join public.ce_usage_shift u on u.player_id = s.player_id;

-- 14) CORRELATIONS
create or replace view public.ce_stat_correlations as
select player_id,
  corr(coalesce(pts,0)::double precision, coalesce(ast,0)::double precision) as pts_ast_corr,
  corr(coalesce(pts,0)::double precision, coalesce(reb,0)::double precision) as pts_reb_corr,
  corr(coalesce(reb,0)::double precision, coalesce(ast,0)::double precision) as reb_ast_corr
from public.ce_player_game_logs_src
where game_date >= current_date - interval '90 days'
group by player_id;

create or replace view public.ce_correlation_flags as
select player_id,
  case
    when pts_ast_corr > 0.50 then 'PTS_AST_STACK'
    when pts_reb_corr > 0.50 then 'PTS_REB_STACK'
    when reb_ast_corr > 0.50 then 'REB_AST_STACK'
    else 'NONE'
  end as correlation_flag
from public.ce_stat_correlations;

-- 15) SUPERMODEL
create or replace view public.ce_supermodel as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.projection_v9, s.std_v9, s.edge_score_v9,
  s.ripple_multiplier_auto, s.defense_multiplier,
  c.correlation_flag,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v9 s
left join public.ce_correlation_flags c on c.player_id = s.player_id;

create or replace view public.ce_supermodel_top_plays as
select * from public.ce_supermodel
where edge_score_v9 >= 60
order by edge_score_v9 desc nulls last
limit 25;

create or replace view public.ce_monte_input_supermodel as
select
  player_name, player_id, game_key, stat_key, line_value,
  projection_v9 as projection_mean, std_v9 as sim_std, edge_score_v9,
  correlation_flag, ripple_multiplier_auto, defense_multiplier,
  over_odds, under_odds, provider, vendor
from public.ce_supermodel_top_plays;

-- 16) DOWNSTREAM V5
create or replace view public.ce_scorecards_top_v5 as
select * from public.ce_scorecards_fast_v9 where edge_score_v9 >= 55;

create or replace view public.ce_scorecards_top_25_v5 as
select * from public.ce_scorecards_top_v5
order by edge_score_v9 desc nulls last limit 25;

create or replace view public.ce_monte_input_heavy_v5 as
select
  player_name, player_id, game_key, stat_key, line_value,
  projection_v9 as projection_mean, std_v9 as sim_std, edge_score_v9,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_v5;
