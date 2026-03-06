-- BATCH 7 FINAL: drop all downstream then rebuild
DROP VIEW IF EXISTS public.ce_monte_input_heavy_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_25_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_top_v5 CASCADE;
DROP VIEW IF EXISTS public.ce_scorecards_fast_v9 CASCADE;
DROP VIEW IF EXISTS public.ce_defense_difficulty CASCADE;
DROP VIEW IF EXISTS public.ce_usage_shift CASCADE;
DROP VIEW IF EXISTS public.ce_usage_baseline CASCADE;
DROP VIEW IF EXISTS public.ce_usage_spikes CASCADE;

create or replace view public.ce_usage_spikes as
select
  player_id,
  avg(pts + reb + ast) as avg_pra_10,
  avg(pie) as avg_pie_10
from public.ce_player_game_logs_src
where game_date >= current_date - interval '10 days'
group by player_id;

create or replace view public.ce_usage_baseline as
select
  player_id,
  avg(pts + reb + ast) as avg_pra_season,
  avg(pie) as avg_pie_season
from public.ce_player_game_logs_src
where game_date >= current_date - interval '120 days'
group by player_id;

create or replace view public.ce_usage_shift as
select
  s.player_id,
  s.avg_pra_10,
  b.avg_pra_season,
  case
    when s.avg_pra_10 > b.avg_pra_season * 1.20 then 1.10
    when s.avg_pra_10 > b.avg_pra_season * 1.10 then 1.05
    else 1.00
  end as ripple_multiplier_auto
from public.ce_usage_spikes s
join public.ce_usage_baseline b
  on s.player_id = b.player_id;

create or replace view public.ce_defense_difficulty as
select
  opponent_team_id,
  avg(pts) as avg_pts_allowed,
  avg(pts) / nullif((select avg(pts) from public.ce_player_game_logs_src where game_date >= current_date - interval '30 days'), 0) as difficulty_multiplier
from public.ce_player_game_logs_src
where game_date >= current_date - interval '30 days'
  and opponent_team_id is not null
group by opponent_team_id;

create or replace view public.ce_scorecards_fast_v9 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.adjusted_projection_v8
    * coalesce(u.ripple_multiplier_auto, 1.00) as projection_v9,
  s.adjusted_std_v8 as std_v9,
  round(
    (1/(1+exp(-1.6 * ((
      s.adjusted_projection_v8
        * coalesce(u.ripple_multiplier_auto, 1.00)
      - s.line_value
    ) / nullif(s.adjusted_std_v8,0))))) * 100
  )::int as edge_score_v9,
  coalesce(u.ripple_multiplier_auto, 1.00) as usage_shift_multiplier,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v8 s
left join public.ce_usage_shift u
  on u.player_id = s.player_id;

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
  projection_v9 as projection_mean,
  std_v9 as sim_std,
  edge_score_v9,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_v5;