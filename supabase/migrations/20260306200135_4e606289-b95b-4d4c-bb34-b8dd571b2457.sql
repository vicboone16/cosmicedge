-- BATCH 5+6 (fixed): Injury Ripple + Matchup Difficulty Engine
-- Note: player_id in CE chain is bigint, players.id is UUID - can't join directly
-- Using team_abbr text instead of team_id bigint for matchup difficulty

-- Tables already created by failed migration attempt, recreate safely
create table if not exists public.ce_injury_ripple_overrides (
  player_id bigint primary key,
  ripple_multiplier numeric default 1.00,
  ripple_reason text,
  updated_at timestamptz default now()
);

drop table if exists public.ce_matchup_difficulty cascade;
create table public.ce_matchup_difficulty (
  team_abbr text,
  stat_key text,
  difficulty_multiplier numeric default 1.00,
  note text,
  updated_at timestamptz default now(),
  primary key (team_abbr, stat_key)
);

create or replace view public.ce_matchup_difficulty_live as
select team_abbr, stat_key, difficulty_multiplier
from public.ce_matchup_difficulty;

-- v8: join ripple by player_id (bigint), matchup by extracting team from game_key
-- Since game_key is in cosmic_games, extract away_team from there
create or replace view public.ce_scorecards_fast_v8 as
select
  s.player_name, s.player_id, s.game_key, s.stat_key, s.line_value,
  s.adjusted_projection_v7, s.adjusted_std_v7, s.edge_score_v7,
  s.streak_flag, s.injury_multiplier, s.matchup_multiplier,
  coalesce(ir.ripple_multiplier,1.00) as ripple_multiplier,
  1.00::numeric as matchup_difficulty,
  s.adjusted_projection_v7
    * coalesce(ir.ripple_multiplier,1.00)
    as adjusted_projection_v8,
  s.adjusted_std_v7 as adjusted_std_v8,
  round(
    (1 / (1 + exp(-1.6 * ((
      s.adjusted_projection_v7
        * coalesce(ir.ripple_multiplier,1.00)
      - s.line_value
    ) / nullif(s.adjusted_std_v7,0))))) * 100
  )::int as edge_score_v8,
  s.over_odds, s.under_odds, s.provider, s.vendor
from public.ce_scorecards_fast_v7 s
left join public.ce_injury_ripple_overrides ir
  on ir.player_id = s.player_id;

create or replace view public.ce_scorecards_top_v5 as
select
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v8, adjusted_std_v8, edge_score_v8,
  ripple_multiplier, matchup_difficulty,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_fast_v8
where edge_score_v8 >= 55;

create or replace view public.ce_scorecards_top_25_v5 as
select * from public.ce_scorecards_top_v5
order by edge_score_v8 desc nulls last
limit 25;

create or replace view public.ce_monte_input_heavy_v5 as
select
  player_name, player_id, game_key, stat_key, line_value,
  adjusted_projection_v8 as projection_mean,
  adjusted_std_v8 as sim_std,
  edge_score_v8, ripple_multiplier, matchup_difficulty,
  over_odds, under_odds, provider, vendor
from public.ce_scorecards_top_v5;