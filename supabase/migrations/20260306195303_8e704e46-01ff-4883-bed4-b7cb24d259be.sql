-- BATCH 3: TOP VIEWS + MONTE INPUT
create or replace view public.ce_scorecards_top_v3 as
select
  player_name,
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
from public.ce_scorecards_fast_v6
where stat_key in ('PTS','REB','AST','PRA','FG3M')
  and edge_score_v6 >= 58;

create or replace view public.ce_scorecards_top_25 as
select *
from public.ce_scorecards_top_v3
order by edge_score_v6 desc nulls last
limit 25;

create or replace view public.ce_scorecards_top_heavy as
select
  player_name,
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
from public.ce_scorecards_fast_v6
where stat_key in ('PTS','REB','AST','PRA','FG3M','PR','PA','RA')
  and edge_score_v6 >= 55
order by edge_score_v6 desc nulls last
limit 50;

create or replace view public.ce_monte_input_heavy as
select
  player_name,
  player_id,
  game_key,
  stat_key,
  line_value,
  adjusted_projection_v6 as projection_mean,
  case
    when stat_key = 'PTS' then 6.0
    when stat_key = 'REB' then 3.0
    when stat_key = 'AST' then 2.5
    when stat_key = 'FG3M' then 1.5
    when stat_key = 'STL' then 0.9
    when stat_key = 'BLK' then 0.9
    when stat_key = 'TOV' then 1.3
    when stat_key = 'PRA' then 8.0
    when stat_key = 'PR' then 6.7
    when stat_key = 'PA' then 6.5
    when stat_key = 'RA' then 4.0
    else 5.0
  end as sim_std,
  edge_score_v6,
  streak_flag,
  injury_multiplier,
  matchup_multiplier,
  astro_tone,
  over_odds,
  under_odds,
  provider,
  vendor
from public.ce_scorecards_top_heavy;