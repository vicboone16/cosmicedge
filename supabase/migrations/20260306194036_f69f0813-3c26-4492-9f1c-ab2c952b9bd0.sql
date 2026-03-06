-- Recreate ce_randn helper
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
  1.00::numeric as astro_multiplier,
  projection_mean
    * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10)))
    * 1.00::numeric as adjusted_projection,
  (1.0 / (1.0 + exp(-1.6 * (
    (projection_mean * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) * 1.00::numeric - line_value)
    / nullif(std_dev, 0)
  ))))::numeric as base_prob,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (projection_mean * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10))) * 1.00::numeric - line_value)
      / nullif(std_dev, 0)
    )))) * 100
  )::int as edge_score,
  case
    when projection_mean
      * greatest(0.90, least(1.10, 1 + (coalesce(pie_mean,0) - 0.10)))
      * 1.00::numeric >= line_value
    then 'OVER'
    else 'UNDER'
  end as lean,
  over_odds, under_odds, provider, vendor
from props_with_proj;

-- v2 momentum
create view public.ce_scorecards_fast_v2 as
select s.*,
  m.momentum_score,
  greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as momentum_multiplier,
  s.adjusted_projection
    * greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) as adjusted_projection_v2,
  (1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection * greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) - s.line_value)
    / nullif(s.std_dev, 0)
  ))))::numeric as base_prob_v2,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection * greatest(0.90, least(1.10, 1 + coalesce(m.momentum_score,0) * 0.02)) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * 100
  )::int as edge_score_v2
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
  s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) as adjusted_projection_v3,
  (1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) - s.line_value)
    / nullif(s.std_dev, 0)
  ))))::numeric as base_prob_v3,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v2 * coalesce(a.astro_mean_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * coalesce(a.astro_conf_multiplier, 1.00) * 100
  )::int as edge_score_v3
from public.ce_scorecards_fast_v2 s
left join public.ce_astro_live a on a.game_key = s.game_key and a.player_id = s.player_id;

-- streaks
create view public.ce_streaks_live as
with props_base as (
  select p.id as prop_id, p.model_player_id as player_id, p.player_name, p.stat_key, p.line_value
  from public.ce_props_norm p
  where p.model_player_id is not null and p.line_value is not null and p.game_date = current_date
),
hist as (
  select pb.prop_id, pb.player_id, pb.stat_key, pb.line_value, g.game_id, g.game_date,
    case pb.stat_key
      when 'PTS' then g.pts when 'REB' then g.reb when 'AST' then g.ast
      when 'FG3M' then g.fg3m when 'STL' then g.stl when 'BLK' then g.blk
      when 'TOV' then g.tov
      when 'PRA' then coalesce(g.pts,0)+coalesce(g.reb,0)+coalesce(g.ast,0)
      when 'PR' then coalesce(g.pts,0)+coalesce(g.reb,0)
      when 'PA' then coalesce(g.pts,0)+coalesce(g.ast,0)
      when 'RA' then coalesce(g.reb,0)+coalesce(g.ast,0)
      else null
    end as actual_value,
    row_number() over (partition by pb.prop_id order by g.game_date desc, g.game_id desc) as rn
  from props_base pb
  join public.ce_player_game_logs_src g on g.player_id = pb.player_id and g.game_date < current_date
),
last10 as (select * from hist where rn <= 10),
agg as (
  select prop_id,
    count(*) filter (where actual_value > line_value) as over_hits_10,
    count(*) filter (where actual_value < line_value) as under_hits_10,
    count(*) filter (where rn <= 5 and actual_value > line_value) as over_hits_5,
    count(*) filter (where rn <= 5 and actual_value < line_value) as under_hits_5
  from last10 group by prop_id
)
select p.prop_id, p.player_name, p.player_id, p.stat_key, p.line_value,
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
from props_base p left join agg a on a.prop_id = p.prop_id;

-- v4 streaks
create view public.ce_scorecards_fast_v4 as
select
  s.prop_id, s.game_key, s.game_date,
  coalesce(st.player_name, s.player_name) as player_name,
  s.player_id, s.stat_key, s.line_value,
  s.projection_mean, s.std_dev, s.plus_minus_mean, s.pie_mean,
  s.pie_multiplier, s.astro_mean_multiplier, s.astro_conf_multiplier, s.astro_tone,
  s.momentum_score, s.momentum_multiplier,
  st.streak_flag, st.streak_multiplier,
  s.adjusted_projection_v3 * coalesce(st.streak_multiplier, 1.00) as adjusted_projection_v4,
  (1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v3 * coalesce(st.streak_multiplier, 1.00) - s.line_value)
    / nullif(s.std_dev, 0)
  ))))::numeric as base_prob_v4,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v3 * coalesce(st.streak_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * 100
  )::int as edge_score_v4,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v3 s
left join public.ce_streaks_live st on st.prop_id = s.prop_id;

-- injury overrides table
create table if not exists public.ce_injury_overrides (
  player_id bigint primary key,
  injury_multiplier numeric default 1.00,
  note text,
  updated_at timestamptz default now()
);

-- v5 injury
create view public.ce_scorecards_fast_v5 as
select s.*,
  coalesce(io.injury_multiplier, 1.00) as injury_multiplier,
  s.adjusted_projection_v4 * coalesce(io.injury_multiplier, 1.00) as adjusted_projection_v5,
  (1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v4 * coalesce(io.injury_multiplier, 1.00) - s.line_value)
    / nullif(s.std_dev, 0)
  ))))::numeric as base_prob_v5,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v4 * coalesce(io.injury_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * 100
  )::int as edge_score_v5
from public.ce_scorecards_fast_v4 s
left join public.ce_injury_overrides io on io.player_id = s.player_id;

-- matchup overrides table
create table if not exists public.ce_matchup_overrides (
  player_id bigint, stat_key text,
  matchup_multiplier numeric default 1.00,
  note text, updated_at timestamptz default now(),
  primary key (player_id, stat_key)
);

-- v6 matchup
create view public.ce_scorecards_fast_v6 as
select s.*,
  coalesce(mo.matchup_multiplier, 1.00) as matchup_multiplier,
  s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) as adjusted_projection_v6,
  (1.0 / (1.0 + exp(-1.6 * (
    (s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) - s.line_value)
    / nullif(s.std_dev, 0)
  ))))::numeric as base_prob_v6,
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * 100
  )::int as edge_score_v6
from public.ce_scorecards_fast_v5 s
left join public.ce_matchup_overrides mo on mo.player_id = s.player_id and mo.stat_key = s.stat_key;

-- top views
create view public.ce_scorecards_top_v3 as
select player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6, streak_flag, injury_multiplier,
  matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
from public.ce_scorecards_fast_v6
where stat_key in ('PTS','REB','AST','PRA','FG3M') and edge_score_v6 >= 58;

create view public.ce_scorecards_top_25 as
select * from public.ce_scorecards_top_v3
order by edge_score_v6 desc nulls last limit 25;

create view public.ce_scorecards_top_heavy as
select player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6, edge_score_v6, streak_flag, injury_multiplier,
  matchup_multiplier, astro_tone, over_odds, under_odds, provider, vendor
from public.ce_scorecards_fast_v6
where stat_key in ('PTS','REB','AST','PRA','FG3M','PR','PA','RA') and edge_score_v6 >= 55
order by edge_score_v6 desc nulls last limit 50;

create view public.ce_monte_input_heavy as
select player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v6 as projection_mean,
  case stat_key
    when 'PTS' then 6.0 when 'REB' then 3.0 when 'AST' then 2.5
    when 'FG3M' then 1.5 when 'STL' then 0.9 when 'BLK' then 0.9
    when 'TOV' then 1.3 when 'PRA' then 8.0 when 'PR' then 6.7
    when 'PA' then 6.5 when 'RA' then 4.0 else 5.0
  end as sim_std,
  edge_score_v6, streak_flag, injury_multiplier, matchup_multiplier, astro_tone,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_heavy;