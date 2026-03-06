-- =====================================================
-- BATCH 1: FOUNDATION – DROP + RECREATE
-- Uses only: public.ce_player_game_logs_src, public.ce_props_norm
-- =====================================================

-- Drop all dependent views first (reverse dependency order)
DROP VIEW IF EXISTS public.ce_monte_input_heavy CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_heavy CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v3 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v6 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_injury_ripple CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v4 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v3 CASCADE;
DROP VIEW IF EXISTS public.ce_astro_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v2 CASCADE;
DROP VIEW IF EXISTS public.ce_streaks_live CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast CASCADE;
DROP VIEW IF EXISTS public.ce_momentum_live CASCADE;

-- helper
create or replace function public.ce_randn()
returns double precision language sql volatile
as $$ select sqrt(-2.0 * ln(greatest(1e-12, random()))) * cos(2.0 * pi() * random()); $$;

-- momentum
create view public.ce_momentum_live as
with ranked as (
  select player_id, game_id, game_date, pts,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src where game_date < current_date
),
season_stats as (select player_id, avg(pts) as season_pts from ranked group by player_id),
last5 as (select player_id, avg(pts) as last5_pts from ranked where rn <= 5 group by player_id),
last10 as (select player_id, avg(pts) as last10_pts from ranked where rn <= 10 group by player_id)
select s.player_id, 'PTS'::text as stat_key,
  l5.last5_pts as last_5_avg, l10.last10_pts as last_10_avg,
  s.season_pts as season_avg,
  coalesce(l5.last5_pts,0) - coalesce(s.season_pts,0) as momentum_score
from season_stats s
left join last5 l5 on l5.player_id = s.player_id
left join last10 l10 on l10.player_id = s.player_id;

-- v1 base scorecards
create view public.ce_scorecards_fast as
with ranked as (
  select player_id, game_id, game_date, pts, reb, ast, fg3m, stl, blk, tov, plus_minus, pie,
    row_number() over (partition by player_id order by game_date desc, game_id desc) as rn
  from public.ce_player_game_logs_src where game_date < current_date
),
sample as (select * from ranked where rn <= 10),
agg as (
  select player_id,
    avg(pts) as pts_mean, avg(reb) as reb_mean, avg(ast) as ast_mean,
    avg(fg3m) as fg3m_mean, avg(stl) as stl_mean, avg(blk) as blk_mean,
    avg(tov) as tov_mean,
    avg(coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0)) as pra_mean,
    stddev_samp(pts) as pts_std, stddev_samp(reb) as reb_std,
    stddev_samp(ast) as ast_std, stddev_samp(fg3m) as fg3m_std,
    stddev_samp(stl) as stl_std, stddev_samp(blk) as blk_std,
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
    case p.stat_key
      when 'PTS' then a.pts_mean when 'REB' then a.reb_mean
      when 'AST' then a.ast_mean when 'FG3M' then a.fg3m_mean
      when 'STL' then a.stl_mean when 'BLK' then a.blk_mean
      when 'TOV' then a.tov_mean when 'PRA' then a.pra_mean
      when 'PR' then coalesce(a.pts_mean,0)+coalesce(a.reb_mean,0)
      when 'PA' then coalesce(a.pts_mean,0)+coalesce(a.ast_mean,0)
      when 'RA' then coalesce(a.reb_mean,0)+coalesce(a.ast_mean,0)
      else null
    end as projection_mean,
    case p.stat_key
      when 'PTS' then coalesce(a.pts_std,6.0) when 'REB' then coalesce(a.reb_std,3.0)
      when 'AST' then coalesce(a.ast_std,2.5) when 'FG3M' then coalesce(a.fg3m_std,1.5)
      when 'STL' then coalesce(a.stl_std,0.9) when 'BLK' then coalesce(a.blk_std,0.9)
      when 'TOV' then coalesce(a.tov_std,1.3) when 'PRA' then coalesce(a.pra_std,8.0)
      when 'PR' then sqrt(power(coalesce(a.pts_std,6.0),2)+power(coalesce(a.reb_std,3.0),2))
      when 'PA' then sqrt(power(coalesce(a.pts_std,6.0),2)+power(coalesce(a.ast_std,2.5),2))
      when 'RA' then sqrt(power(coalesce(a.reb_std,3.0),2)+power(coalesce(a.ast_std,2.5),2))
      else null
    end as std_dev
  from public.ce_props_norm p
  join agg a on a.player_id = p.model_player_id
  where p.model_player_id is not null and p.line_value is not null and p.game_date = current_date
)
select
  prop_id, game_key, game_date, player_name, player_id, stat_key, line_value,
  projection_mean, std_dev, plus_minus_mean, pie_mean,
  greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) as pie_multiplier,
  projection_mean
    * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) as adjusted_projection,
  over_odds, under_odds, provider, vendor
from props_with_proj;

-- v2 momentum
create view public.ce_scorecards_fast_v2 as
select s.*,
  m.momentum_score,
  greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as momentum_multiplier,
  s.adjusted_projection
    * greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as adjusted_projection_v2
from public.ce_scorecards_fast s
left join public.ce_momentum_live m on m.player_id = s.player_id and m.stat_key = 'PTS';

-- astro placeholder
create view public.ce_astro_live as
select p.game_key, p.player_id,
  1.00::numeric as astro_mean_multiplier,
  1.00::numeric as astro_conf_multiplier,
  'neutral'::text as astro_tone
from public.ce_scorecards_fast_v2 p;

-- v3 astro
create view public.ce_scorecards_fast_v3 as
select s.*,
  a.astro_mean_multiplier, a.astro_conf_multiplier, a.astro_tone,
  s.adjusted_projection_v2
    * coalesce(a.astro_mean_multiplier, 1.00) as adjusted_projection_v3,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * coalesce(a.astro_conf_multiplier, 1.00) * 100
  )::int as edge_score_v3
from public.ce_scorecards_fast_v2 s
left join public.ce_astro_live a on a.game_key = s.game_key and a.player_id = s.player_id;