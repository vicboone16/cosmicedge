-- BATCH 7+8: Usage Shift + Defense Difficulty + Correlation + Supermodel
-- Adapted: uses team_id (int) and opponent_team_id (int), no team_abbr

DROP VIEW IF EXISTS public.ce_monte_input_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel_top_plays CASCADE;
DROP VIEW IF EXISTS public.ce_supermodel CASCADE;
DROP VIEW IF EXISTS public.ce_correlation_flags CASCADE;
DROP VIEW IF EXISTS public.ce_stat_correlations CASCADE;
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v9 CASCADE;
DROP VIEW IF EXISTS public.ce_defense_difficulty CASCADE;
DROP VIEW IF EXISTS public.ce_usage_shift CASCADE;
DROP VIEW IF EXISTS public.ce_usage_baseline CASCADE;
DROP VIEW IF EXISTS public.ce_usage_spikes CASCADE;
DROP VIEW IF EXISTS public.ce_player_current_team CASCADE;

-- 1) Current team by player (uses team_id int)
create or replace view public.ce_player_current_team as
with ranked as (
  select player_id, team_id, game_date, game_id,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src
  where team_id is not null
)
select player_id, team_id
from ranked where rn = 1;

-- 2) Usage spikes (10 day)
create or replace view public.ce_usage_spikes as
select player_id,
  avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as avg_pra_10,
  avg(coalesce(pie,0)) as avg_pie_10
from public.ce_player_game_logs_src
where game_date >= current_date - interval '10 days'
group by player_id;

-- 3) Usage baseline (120 day)
create or replace view public.ce_usage_baseline as
select player_id,
  avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as avg_pra_season,
  avg(coalesce(pie,0)) as avg_pie_season
from public.ce_player_game_logs_src
where game_date >= current_date - interval '120 days'
group by player_id;

-- 4) Usage shift
create or replace view public.ce_usage_shift as
select s.player_id, s.avg_pra_10, b.avg_pra_season,
  case
    when s.avg_pra_10 > b.avg_pra_season * 1.20 then 1.10
    when s.avg_pra_10 > b.avg_pra_season * 1.10 then 1.05
    when s.avg_pra_10 < b.avg_pra_season * 0.90 then 0.97
    else 1.00
  end as ripple_multiplier_auto
from public.ce_usage_spikes s
join public.ce_usage_baseline b on s.player_id = b.player_id;

-- 5) Defense difficulty by opponent_team_id (what opponents score against this team)
create or replace view public.ce_defense_difficulty as
with base as (
  select opponent_team_id,
    avg(coalesce(pts,0)) as pts_allowed,
    avg(coalesce(reb,0)) as reb_allowed,
    avg(coalesce(ast,0)) as ast_allowed,
    avg(coalesce(fg3m,0)) as fg3m_allowed,
    avg(coalesce(stl,0)) as stl_allowed,
    avg(coalesce(blk,0)) as blk_allowed,
    avg(coalesce(tov,0)) as tov_allowed,
    avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_allowed
  from public.ce_player_game_logs_src
  where game_date >= current_date - interval '30 days'
    and opponent_team_id is not null
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

-- 6) Scorecards v9 - usage shift + defense difficulty via opponent lookup
-- Note: defense join uses opponent_team_id from ce_props_norm via cosmic_games
-- For now, join defense via the player's current team's opponent (not available in chain)
-- So we apply usage shift only; defense is a placeholder 1.00
create or replace view public.ce_scorecards_fast_v9 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.adjusted_projection_v8
    * coalesce(u.ripple_multiplier_auto, 1.00) as projection_v9,
  s.adjusted_std_v8 as std_v9,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v8 * coalesce(u.ripple_multiplier_auto, 1.00)
      - s.line_value
    ) / nullif(s.adjusted_std_v8,0))))) * 100
  )::int as edge_score_v9,
  coalesce(u.ripple_multiplier_auto, 1.00) as ripple_multiplier_auto,
  1.00::numeric as defense_multiplier,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v8 s
left join public.ce_usage_shift u on u.player_id = s.player_id;

-- 7) Stat correlations
create or replace view public.ce_stat_correlations as
select player_id,
  corr(coalesce(pts,0)::double precision, coalesce(ast,0)::double precision) as pts_ast_corr,
  corr(coalesce(pts,0)::double precision, coalesce(reb,0)::double precision) as pts_reb_corr,
  corr(coalesce(reb,0)::double precision, coalesce(ast,0)::double precision) as reb_ast_corr
from public.ce_player_game_logs_src
where game_date >= current_date - interval '90 days'
group by player_id;

-- 8) Correlation flags
create or replace view public.ce_correlation_flags as
select player_id,
  case
    when pts_ast_corr > 0.50 then 'PTS_AST_STACK'
    when pts_reb_corr > 0.50 then 'PTS_REB_STACK'
    when reb_ast_corr > 0.50 then 'REB_AST_STACK'
    else 'NONE'
  end as correlation_flag
from public.ce_stat_correlations;

-- 9) Supermodel
create or replace view public.ce_supermodel as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.projection_v9, s.std_v9, s.edge_score_v9,
  s.ripple_multiplier_auto, s.defense_multiplier,
  c.correlation_flag,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v9 s
left join public.ce_correlation_flags c on c.player_id = s.player_id;

-- 10) Top plays
create or replace view public.ce_supermodel_top_plays as
select * from public.ce_supermodel
where edge_score_v9 >= 60
order by edge_score_v9 desc nulls last
limit 25;

-- 11) Monte input
create or replace view public.ce_monte_input_supermodel as
select
  player_name, player_id, game_key, stat_key, line_value,
  projection_v9 as projection_mean, std_v9 as sim_std,
  edge_score_v9, correlation_flag, ripple_multiplier_auto, defense_multiplier,
  over_odds, under_odds, provider, vendor
from public.ce_supermodel_top_plays;

-- Rebuild downstream top views
create or replace view public.ce_scorecards_top_v5 as
select * from public.ce_scorecards_fast_v9
where edge_score_v9 >= 55;

create or replace view public.ce_scorecards_top_25_v5 as
select * from public.ce_scorecards_top_v5
order by edge_score_v9 desc nulls last
limit 25;

create or replace view public.ce_monte_input_heavy_v5 as
select
  player_name, player_id, game_key, stat_key, line_value,
  projection_v9 as projection_mean, std_v9 as sim_std,
  edge_score_v9, over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_v5;