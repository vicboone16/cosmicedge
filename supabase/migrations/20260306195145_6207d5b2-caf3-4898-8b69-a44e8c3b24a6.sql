-- =====================================================
-- BATCH 2: STREAK + OVERRIDES
-- =====================================================

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
  round(
    (1.0 / (1.0 + exp(-1.6 * (
      (s.adjusted_projection_v5 * coalesce(mo.matchup_multiplier, 1.00) - s.line_value)
      / nullif(s.std_dev, 0)
    )))) * 100
  )::int as edge_score_v6
from public.ce_scorecards_fast_v5 s
left join public.ce_matchup_overrides mo on mo.player_id = s.player_id and mo.stat_key = s.stat_key;