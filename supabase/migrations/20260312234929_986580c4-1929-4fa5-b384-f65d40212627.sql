create or replace view public.ce_defense_difficulty as
with base as (
  select
    ce_player_game_logs_src.opponent_team_id,
    avg(coalesce(ce_player_game_logs_src.pts, 0::numeric)) as pts_allowed,
    avg(coalesce(ce_player_game_logs_src.reb, 0::numeric)) as reb_allowed,
    avg(coalesce(ce_player_game_logs_src.ast, 0::numeric)) as ast_allowed,
    avg(coalesce(ce_player_game_logs_src.fg3m, 0::numeric)) as fg3m_allowed,
    avg(coalesce(ce_player_game_logs_src.stl, 0::numeric)) as stl_allowed,
    avg(coalesce(ce_player_game_logs_src.blk, 0::numeric)) as blk_allowed,
    avg(coalesce(ce_player_game_logs_src.tov, 0::numeric)) as tov_allowed,
    avg(coalesce(ce_player_game_logs_src.pts, 0::numeric) + coalesce(ce_player_game_logs_src.reb, 0::numeric) + coalesce(ce_player_game_logs_src.ast, 0::numeric)) as pra_allowed
  from ce_player_game_logs_src
  where ce_player_game_logs_src.game_date >= (current_date - '30 days'::interval)
    and ce_player_game_logs_src.opponent_team_id is not null
  group by ce_player_game_logs_src.opponent_team_id
),
league as (
  select
    avg(coalesce(ce_player_game_logs_src.pts, 0::numeric)) as pts_avg,
    avg(coalesce(ce_player_game_logs_src.reb, 0::numeric)) as reb_avg,
    avg(coalesce(ce_player_game_logs_src.ast, 0::numeric)) as ast_avg,
    avg(coalesce(ce_player_game_logs_src.fg3m, 0::numeric)) as fg3m_avg,
    avg(coalesce(ce_player_game_logs_src.stl, 0::numeric)) as stl_avg,
    avg(coalesce(ce_player_game_logs_src.blk, 0::numeric)) as blk_avg,
    avg(coalesce(ce_player_game_logs_src.tov, 0::numeric)) as tov_avg,
    avg(coalesce(ce_player_game_logs_src.pts, 0::numeric) + coalesce(ce_player_game_logs_src.reb, 0::numeric) + coalesce(ce_player_game_logs_src.ast, 0::numeric)) as pra_avg
  from ce_player_game_logs_src
  where ce_player_game_logs_src.game_date >= (current_date - '30 days'::interval)
),
unioned as (
  select
    b.opponent_team_id,
    'PTS'::text as stat_key,
    greatest(0.90, least(1.10, b.pts_allowed / nullif(l.pts_avg, 0::numeric))) as difficulty_multiplier
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'REB'::text as text,
    greatest(0.90, least(1.10, b.reb_allowed / nullif(l.reb_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'AST'::text as text,
    greatest(0.90, least(1.10, b.ast_allowed / nullif(l.ast_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'FG3M'::text as text,
    greatest(0.90, least(1.10, b.fg3m_allowed / nullif(l.fg3m_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'STL'::text as text,
    greatest(0.90, least(1.10, b.stl_allowed / nullif(l.stl_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'BLK'::text as text,
    greatest(0.90, least(1.10, b.blk_allowed / nullif(l.blk_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'TOV'::text as text,
    greatest(0.90, least(1.10, b.tov_allowed / nullif(l.tov_avg, 0::numeric))) as greatest
  from base b
  cross join league l

  union all

  select
    b.opponent_team_id,
    'PRA'::text as text,
    greatest(0.90, least(1.10, b.pra_allowed / nullif(l.pra_avg, 0::numeric))) as greatest
  from base b
  cross join league l
)
select
  opponent_team_id,
  stat_key,
  difficulty_multiplier
from unioned;