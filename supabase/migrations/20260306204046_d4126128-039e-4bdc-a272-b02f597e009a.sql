
-- =====================================================
-- COSMICEDGE BATCH 9
-- Same-Game Parlay / Multi-Leg Correlation Layer
-- =====================================================

-- 1) Same-player stat correlations
create or replace view public.ce_same_player_corr as
select
  player_id,
  corr(coalesce(pts,0)::double precision, coalesce(ast,0)::double precision) as pts_ast_corr,
  corr(coalesce(pts,0)::double precision, coalesce(reb,0)::double precision) as pts_reb_corr,
  corr(coalesce(ast,0)::double precision, coalesce(reb,0)::double precision) as ast_reb_corr,
  corr(coalesce(pts,0)::double precision, (coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0))::double precision) as pts_pra_corr,
  corr(coalesce(reb,0)::double precision, (coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0))::double precision) as reb_pra_corr,
  corr(coalesce(ast,0)::double precision, (coalesce(pts,0)+coalesce(reb,0)+coalesce(ast,0))::double precision) as ast_pra_corr
from public.ce_player_game_logs_src
where game_date >= current_date - interval '120 days'
group by player_id;

-- 2) Same-game parlay candidate pairs
create or replace view public.ce_parlay_pairs as
select
  a.game_key,
  a.player_name as player_name_a, a.player_id as player_id_a,
  a.stat_key as stat_key_a, a.line_value as line_value_a,
  a.projection_mean as projection_mean_a, a.sim_std as sim_std_a,
  a.edge_score_v9 as edge_score_a,
  b.player_name as player_name_b, b.player_id as player_id_b,
  b.stat_key as stat_key_b, b.line_value as line_value_b,
  b.projection_mean as projection_mean_b, b.sim_std as sim_std_b,
  b.edge_score_v9 as edge_score_b
from public.ce_monte_input_supermodel a
join public.ce_monte_input_supermodel b
  on a.game_key = b.game_key
 and (a.player_id < b.player_id
      or (a.player_id = b.player_id and a.stat_key < b.stat_key));

-- 3) Pair correlation inference
create or replace view public.ce_parlay_pair_scored as
select
  p.*,
  case
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PTS' and p.stat_key_b = 'AST' then coalesce(c.pts_ast_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'AST' and p.stat_key_b = 'PTS' then coalesce(c.pts_ast_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PTS' and p.stat_key_b = 'REB' then coalesce(c.pts_reb_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'REB' and p.stat_key_b = 'PTS' then coalesce(c.pts_reb_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'AST' and p.stat_key_b = 'REB' then coalesce(c.ast_reb_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'REB' and p.stat_key_b = 'AST' then coalesce(c.ast_reb_corr, 0.00)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PTS' and p.stat_key_b = 'PRA' then coalesce(c.pts_pra_corr, 0.25)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PRA' and p.stat_key_b = 'PTS' then coalesce(c.pts_pra_corr, 0.25)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'REB' and p.stat_key_b = 'PRA' then coalesce(c.reb_pra_corr, 0.25)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PRA' and p.stat_key_b = 'REB' then coalesce(c.reb_pra_corr, 0.25)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'AST' and p.stat_key_b = 'PRA' then coalesce(c.ast_pra_corr, 0.25)
    when p.player_id_a = p.player_id_b and p.stat_key_a = 'PRA' and p.stat_key_b = 'AST' then coalesce(c.ast_pra_corr, 0.25)
    else 0.00
  end as pair_corr,
  case
    when p.player_id_a = p.player_id_b then 'SAME_PLAYER'
    else 'SAME_GAME'
  end as pair_type
from public.ce_parlay_pairs p
left join public.ce_same_player_corr c on c.player_id = p.player_id_a;

-- 4) Joint probabilities with correlation adjustment
create or replace view public.ce_parlay_probabilities as
select
  p.*,
  greatest(0.01, least(0.99, p.edge_score_a / 100.0)) as leg_prob_a,
  greatest(0.01, least(0.99, p.edge_score_b / 100.0)) as leg_prob_b,
  (greatest(0.01, least(0.99, p.edge_score_a / 100.0))
   * greatest(0.01, least(0.99, p.edge_score_b / 100.0)))::numeric as naive_joint_prob,
  (greatest(0.01, least(0.99,
    (greatest(0.01, least(0.99, p.edge_score_a / 100.0))
     * greatest(0.01, least(0.99, p.edge_score_b / 100.0)))
    * case
        when p.pair_corr >= 0.50 then 1.15
        when p.pair_corr >= 0.25 then 1.08
        when p.pair_corr <= -0.50 then 0.85
        when p.pair_corr <= -0.25 then 0.92
        else 1.00
      end
  )))::numeric as adjusted_joint_prob,
  case
    when p.pair_corr >= 0.50 then 'STRONG_POSITIVE'
    when p.pair_corr >= 0.25 then 'POSITIVE'
    when p.pair_corr <= -0.50 then 'STRONG_NEGATIVE'
    when p.pair_corr <= -0.25 then 'NEGATIVE'
    else 'NEUTRAL'
  end as corr_label
from public.ce_parlay_pair_scored p;

-- 5) Top same-game parlay candidates
create or replace view public.ce_parlay_top_plays as
select
  game_key, player_name_a, stat_key_a, line_value_a, edge_score_a,
  player_name_b, stat_key_b, line_value_b, edge_score_b,
  pair_type, pair_corr, corr_label, naive_joint_prob, adjusted_joint_prob
from public.ce_parlay_probabilities
where edge_score_a >= 58 and edge_score_b >= 58 and adjusted_joint_prob >= 0.30
order by adjusted_joint_prob desc nulls last
limit 50;
