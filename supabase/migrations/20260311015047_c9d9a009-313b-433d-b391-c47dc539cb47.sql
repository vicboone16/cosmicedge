
CREATE OR REPLACE FUNCTION public.tt_recompute_metrics(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  m public.tt_matches%rowtype;
  lp record;
  v_ps numeric;
  v_pr numeric;
  winp numeric;
  c05 numeric;
  c15 numeric;
  c25 numeric;
  c35 numeric;
  c45 numeric;
  o165 numeric;
  o175 numeric;
  o185 numeric;
  o195 numeric;
  o205 numeric;
  v_deuce_wp numeric;
  v_total_pts int;
begin
  select * into m from public.tt_matches where id = p_match_id;
  select * into lp from public.tt_live_learned_probs where match_id = p_match_id;
  v_ps := coalesce(lp.ps, 0.56);
  v_pr := coalesce(lp.pr, 0.52);

  -- Try state matrix lookup
  select s.win_prob_a, s.cover_m15, s.cover_m25, s.cover_m35, s.cover_m45,
    s.over_165, s.over_175, s.over_185, s.over_195, s.over_205
  into winp, c15, c25, c35, c45, o165, o175, o185, o195, o205
  from public.tt_state_matrix s
  where s.score_a = m.score_a and s.score_b = m.score_b
    and s.server = m.next_server and s.serves_left = m.serves_left
  order by abs(s.ps - v_ps) + abs(s.pr - v_pr)
  limit 1;

  -- If no matrix row (deuce / score > 10), compute analytically
  if winp is null and m.score_a >= 10 and m.score_b >= 10 then
    -- At deuce, serve alternates every point
    -- P(A wins from deuce) = ps*pr / (ps*pr + (1-ps)*(1-pr))
    v_deuce_wp := (v_ps * v_pr) / nullif(v_ps * v_pr + (1.0 - v_ps) * (1.0 - v_pr), 0);
    v_deuce_wp := coalesce(v_deuce_wp, 0.5);

    if m.score_a = m.score_b then
      -- Exactly deuce
      if m.next_server = 'A' then
        winp := v_deuce_wp;
      else
        -- B serves first: A needs to win return then serve
        -- P(A wins) = pr * ps / (pr*ps + (1-pr)*(1-ps)) = same formula
        winp := v_deuce_wp;
      end if;
    elsif m.score_a > m.score_b then
      -- A leads by 1 at deuce territory (e.g. 11-10)
      -- A needs 1 more or survive deuce
      if m.next_server = 'A' then
        -- A serves: if A wins (ps), game over. If B wins (1-ps), deuce.
        winp := v_ps + (1.0 - v_ps) * v_deuce_wp;
      else
        -- B serves: if A wins return (pr), game over. If B wins serve (1-pr), deuce.
        winp := v_pr + (1.0 - v_pr) * v_deuce_wp;
      end if;
    else
      -- B leads by 1 (e.g. 10-11)
      if m.next_server = 'A' then
        -- A serves: if A wins (ps), deuce. If B wins (1-ps), game over for B.
        winp := v_ps * v_deuce_wp;
      else
        -- B serves: if A wins return (pr), deuce. If B wins (1-pr), game over for B.
        winp := v_pr * v_deuce_wp;
      end if;
    end if;

    -- Simplified market estimates for deuce territory
    v_total_pts := m.score_a + m.score_b;
    c15 := winp; -- cover -1.5 ≈ win prob at deuce (margin is tight)
    c25 := greatest(0, winp - 0.15);
    c35 := greatest(0, winp - 0.30);
    c45 := greatest(0, winp - 0.40);
    -- Over/under: most deuce games end 11-9 to 13-11 range (20-24 total)
    o165 := case when v_total_pts >= 16 then 1.0 else 0.95 end;
    o175 := case when v_total_pts >= 17 then 1.0 else 0.90 end;
    o185 := case when v_total_pts >= 18 then 1.0 else 0.85 end;
    o195 := case when v_total_pts >= 19 then 1.0 else 0.75 end;
    o205 := case when v_total_pts >= 20 then 1.0
                 when v_total_pts >= 18 then 0.80
                 else 0.60 end;
  end if;

  -- If still null (no matrix and not deuce), use defaults
  if winp is null then
    winp := 0.5;
    c15 := 0.5; c25 := 0.35; c35 := 0.25; c45 := 0.15;
    o165 := 0.7; o175 := 0.55; o185 := 0.45; o195 := 0.30; o205 := 0.15;
  end if;

  c05 := winp;

  insert into public.tt_match_metrics(
    match_id, ps, pr, win_prob_a, cover_m05, cover_m15, cover_m25, cover_m35, cover_m45,
    over_165, over_175, over_185, over_195, over_205, updated_at
  )
  values(
    p_match_id, v_ps, v_pr, winp, c05, c15, c25, c35, c45,
    o165, o175, o185, o195, o205, now()
  )
  on conflict(match_id) do update set
    ps = excluded.ps, pr = excluded.pr, win_prob_a = excluded.win_prob_a,
    cover_m05 = excluded.cover_m05, cover_m15 = excluded.cover_m15,
    cover_m25 = excluded.cover_m25, cover_m35 = excluded.cover_m35,
    cover_m45 = excluded.cover_m45,
    over_165 = excluded.over_165, over_175 = excluded.over_175,
    over_185 = excluded.over_185, over_195 = excluded.over_195,
    over_205 = excluded.over_205, updated_at = now();

  insert into public.tt_prob_history(match_id, score_a, score_b, win_prob_a, cover_m15, over_185)
  values(p_match_id, m.score_a, m.score_b, winp, c15, o185);

  update public.tt_matches set updated_at = now() where id = p_match_id;
end;
$function$;
