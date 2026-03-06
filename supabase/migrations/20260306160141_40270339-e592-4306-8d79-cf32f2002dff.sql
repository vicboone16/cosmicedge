
-- Step 1: Drop ALL dependent views first (cascade handles chains)
DROP VIEW IF EXISTS public.tt_best_opportunities CASCADE;
DROP VIEW IF EXISTS public.tt_momentum_signal CASCADE;
DROP VIEW IF EXISTS public.tt_momentum_shock CASCADE;
DROP VIEW IF EXISTS public.tt_admin_dashboard CASCADE;
DROP VIEW IF EXISTS public.tt_match_list CASCADE;
DROP VIEW IF EXISTS public.tt_live_model CASCADE;
DROP VIEW IF EXISTS public.tt_live_learned_probs CASCADE;

-- Step 2: Fix tt_matches to match Live schema
-- Remove old columns that don't exist on Live
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS current_server;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS p_s;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS p_r;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS ml_odds_a;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS spread_line;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS spread_odds;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS total_line;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS over_odds;
ALTER TABLE public.tt_matches DROP COLUMN IF EXISTS under_odds;

-- Ensure columns match Live defaults
ALTER TABLE public.tt_matches ALTER COLUMN player_a SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN player_a SET DEFAULT 'A'::text;
ALTER TABLE public.tt_matches ALTER COLUMN player_b SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN player_b SET DEFAULT 'B'::text;
ALTER TABLE public.tt_matches ALTER COLUMN first_server SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN score_a SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN score_b SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN serves_left SET NOT NULL;

-- next_server: make NOT NULL with default
UPDATE public.tt_matches SET next_server = 'A' WHERE next_server IS NULL;
ALTER TABLE public.tt_matches ALTER COLUMN next_server SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN next_server SET DEFAULT 'A'::text;

-- edge_threshold and best_bet_threshold: make NOT NULL with defaults
UPDATE public.tt_matches SET edge_threshold = 0.03 WHERE edge_threshold IS NULL;
ALTER TABLE public.tt_matches ALTER COLUMN edge_threshold SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN edge_threshold SET DEFAULT 0.03;

UPDATE public.tt_matches SET best_bet_threshold = 0.05 WHERE best_bet_threshold IS NULL;
ALTER TABLE public.tt_matches ALTER COLUMN best_bet_threshold SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN best_bet_threshold SET DEFAULT 0.05;

ALTER TABLE public.tt_matches ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.tt_matches ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS tt_matches_status_idx ON public.tt_matches USING btree (status);

-- Step 3: Create missing tables
CREATE TABLE IF NOT EXISTS public.tt_serve_stats (
  match_id uuid NOT NULL PRIMARY KEY,
  a_serve_points integer NOT NULL DEFAULT 0,
  a_serve_wins_by_a integer NOT NULL DEFAULT 0,
  b_serve_points integer NOT NULL DEFAULT 0,
  b_serve_wins_by_a integer NOT NULL DEFAULT 0,
  prior_ps numeric NOT NULL DEFAULT 0.56,
  prior_pr numeric NOT NULL DEFAULT 0.52,
  prior_strength integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tt_market_odds (
  match_id uuid NOT NULL PRIMARY KEY,
  ml_a integer, spread_line numeric, spread_a integer,
  total_line numeric, over_odds integer, under_odds integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tt_match_metrics (
  match_id uuid NOT NULL PRIMARY KEY,
  ps numeric NOT NULL, pr numeric NOT NULL,
  win_prob_a numeric NOT NULL,
  cover_m05 numeric NOT NULL, cover_m15 numeric NOT NULL,
  cover_m25 numeric NOT NULL, cover_m35 numeric NOT NULL, cover_m45 numeric NOT NULL,
  over_165 numeric NOT NULL, over_175 numeric NOT NULL,
  over_185 numeric NOT NULL, over_195 numeric NOT NULL, over_205 numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.tt_score_states_id_seq;
CREATE TABLE IF NOT EXISTS public.tt_score_states (
  id integer NOT NULL DEFAULT nextval('tt_score_states_id_seq'::regclass) PRIMARY KEY,
  score_a integer, score_b integer, server text,
  serves_left integer, is_terminal boolean DEFAULT false, winner text
);
ALTER SEQUENCE public.tt_score_states_id_seq OWNED BY public.tt_score_states.id;

CREATE TABLE IF NOT EXISTS public.tt_state_matrix (
  score_a integer NOT NULL, score_b integer NOT NULL,
  server text NOT NULL, serves_left integer NOT NULL,
  ps numeric NOT NULL, pr numeric NOT NULL,
  win_prob_a numeric, cover_m15 numeric, cover_m25 numeric,
  cover_m35 numeric, cover_m45 numeric,
  over_165 numeric, over_175 numeric, over_185 numeric,
  over_195 numeric, over_205 numeric,
  PRIMARY KEY (score_a, score_b, server, serves_left, ps, pr)
);
CREATE INDEX IF NOT EXISTS tt_state_matrix_lookup ON public.tt_state_matrix USING btree (score_a, score_b, server, serves_left, ps, pr);

CREATE TABLE IF NOT EXISTS public.tt_points (
  id bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  match_id uuid NOT NULL, point_number integer NOT NULL,
  winner text NOT NULL, server text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tt_points_match_idx ON public.tt_points USING btree (match_id, point_number);

CREATE TABLE IF NOT EXISTS public.tt_prob_history (
  id bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  match_id uuid, score_a integer, score_b integer,
  win_prob_a numeric, cover_m15 numeric, over_185 numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tt_match_events (
  id bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  match_id uuid NOT NULL, event_type text NOT NULL,
  payload jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tt_match_events_match_idx ON public.tt_match_events USING btree (match_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tt_recalc_queue (
  id bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  match_id uuid NOT NULL, reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS tt_recalc_queue_status_idx ON public.tt_recalc_queue USING btree (status, created_at);

-- Step 4: Functions
CREATE OR REPLACE FUNCTION public.tt_is_terminal(a integer, b integer)
 RETURNS TABLE(is_terminal boolean, win_a boolean) LANGUAGE sql IMMUTABLE
AS $f$ select ((a>=11 and a-b>=2) or (b>=11 and b-a>=2)), (a>=11 and a-b>=2); $f$;

CREATE OR REPLACE FUNCTION public.tt_deuce_win_prob(ps numeric, pr numeric)
 RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$ select (ps*pr)/((ps*pr)+((1-ps)*(1-pr))); $f$;

CREATE OR REPLACE FUNCTION public.tt_advance_serve_state(a_after integer, b_after integer, server_before text, serves_left_before integer)
 RETURNS TABLE(next_server text, serves_left integer) LANGUAGE sql IMMUTABLE
AS $f$
select case when a_after>=10 and b_after>=10 then case when server_before='A' then 'B' else 'A' end
  when serves_left_before=1 then case when server_before='A' then 'B' else 'A' end else server_before end,
case when a_after>=10 and b_after>=10 then 1 when serves_left_before=1 then 2 else serves_left_before-1 end
$f$;

CREATE OR REPLACE FUNCTION public.tt_next_state(a integer, b integer, server text, serves_left integer, winner text)
 RETURNS TABLE(next_a integer, next_b integer, next_server text, next_serves integer) LANGUAGE plpgsql
AS $f$
begin
if winner='A' then next_a:=a+1;next_b:=b; else next_a:=a;next_b:=b+1; end if;
if(a>=10 and b>=10) then next_server:=case when server='A' then 'B' else 'A' end;next_serves:=1;
else if serves_left=1 then next_server:=case when server='A' then 'B' else 'A' end;next_serves:=2;
else next_server:=server;next_serves:=serves_left-1; end if; end if;
return next;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_win_prob(a integer, b integer, server text, serves_left integer, ps numeric, pr numeric)
 RETURNS numeric LANGUAGE plpgsql
AS $f$
declare p numeric;nA numeric;nB numeric;
begin
if a>=11 and a-b>=2 then return 1; end if;
if b>=11 and b-a>=2 then return 0; end if;
p:=case when server='A' then ps else pr end;
select tt_win_prob(next_a,next_b,next_server,next_serves,ps,pr) into nA from tt_next_state(a,b,server,serves_left,'A');
select tt_win_prob(next_a,next_b,next_server,next_serves,ps,pr) into nB from tt_next_state(a,b,server,serves_left,'B');
return p*nA+(1-p)*nB;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_win_prob_from_deuce_state(a integer, b integer, next_server text, ps numeric, pr numeric)
 RETURNS numeric LANGUAGE plpgsql IMMUTABLE
AS $f$
declare pn numeric;pd numeric;
begin pn:=case when next_server='A' then ps else pr end;pd:=public.tt_deuce_win_prob(ps,pr);
if a=b then return pd; elsif a=b+1 then return pn+(1-pn)*pd; elsif b=a+1 then return pn*pd; else return null; end if;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_win_prob_dp(a integer, b integer, next_server text, serves_left integer, ps numeric, pr numeric)
 RETURNS numeric LANGUAGE plpgsql
AS $f$
declare term record;key text;pn numeric;a1 int;b1 int;ns1 text;sl1 int;a2 int;b2 int;ns2 text;sl2 int;r1 numeric;r2 numeric;outv numeric;
begin
select * into term from public.tt_is_terminal(a,b);
if term.is_terminal then return case when term.win_a then 1 else 0 end; end if;
if(a>=10 and b>=10 and abs(a-b)<=1) then return public.tt_win_prob_from_deuce_state(a,b,next_server,ps,pr); end if;
create temp table if not exists tt_dp_memo(memo_key text primary key,memo_val numeric not null) on commit preserve rows;
key:=concat_ws('|',a,b,next_server,serves_left,ps,pr);
select memo_val into outv from tt_dp_memo where memo_key=key;
if found then return outv; end if;
pn:=case when next_server='A' then ps else pr end;
a1:=a+1;b1:=b;select t.next_server,t.serves_left into ns1,sl1 from public.tt_advance_serve_state(a1,b1,next_server,serves_left) t;
a2:=a;b2:=b+1;select t.next_server,t.serves_left into ns2,sl2 from public.tt_advance_serve_state(a2,b2,next_server,serves_left) t;
if ns1 is null or sl1 is null or ns2 is null or sl2 is null then raise exception 'null'; end if;
r1:=public.tt_win_prob_dp(a1,b1,ns1,sl1,ps,pr);r2:=public.tt_win_prob_dp(a2,b2,ns2,sl2,ps,pr);
outv:=pn*r1+(1-pn)*r2;
insert into tt_dp_memo(memo_key,memo_val) values(key,outv) on conflict(memo_key) do update set memo_val=excluded.memo_val;
return outv;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_cover_prob_dp(a integer, b integer, next_server text, serves_left integer, ps numeric, pr numeric, spread_line numeric)
 RETURNS numeric LANGUAGE plpgsql
AS $f$
declare nm int;term record;key text;pn numeric;a1 int;b1 int;ns1 text;sl1 int;a2 int;b2 int;ns2 text;sl2 int;r1 numeric;r2 numeric;outv numeric;
begin
nm:=floor(abs(spread_line))::int+1;
select * into term from public.tt_is_terminal(a,b);
if term.is_terminal then if term.win_a and(a-b)>=nm then return 1; else return 0; end if; end if;
if(a>=10 and b>=10) then if nm>2 then return 0; else return public.tt_win_prob_dp(a,b,next_server,serves_left,ps,pr); end if; end if;
create temp table if not exists tt_cover_memo(memo_key text primary key,memo_val numeric not null) on commit preserve rows;
key:=concat_ws('|',a,b,next_server,serves_left,nm,ps,pr);
select memo_val into outv from tt_cover_memo where memo_key=key;
if found then return outv; end if;
pn:=case when next_server='A' then ps else pr end;
a1:=a+1;b1:=b;select t.next_server,t.serves_left into ns1,sl1 from public.tt_advance_serve_state(a1,b1,next_server,serves_left) t;
a2:=a;b2:=b+1;select t.next_server,t.serves_left into ns2,sl2 from public.tt_advance_serve_state(a2,b2,next_server,serves_left) t;
if ns1 is null then raise exception 'null'; end if;
r1:=public.tt_cover_prob_dp(a1,b1,ns1,sl1,ps,pr,spread_line);r2:=public.tt_cover_prob_dp(a2,b2,ns2,sl2,ps,pr,spread_line);
outv:=pn*r1+(1-pn)*r2;
insert into tt_cover_memo(memo_key,memo_val) values(key,outv) on conflict(memo_key) do update set memo_val=excluded.memo_val;
return outv;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_over_prob_dp(a integer, b integer, next_server text, serves_left integer, ps numeric, pr numeric, total_line numeric)
 RETURNS numeric LANGUAGE plpgsql
AS $f$
declare thr int;term record;key text;pn numeric;a1 int;b1 int;ns1 text;sl1 int;a2 int;b2 int;ns2 text;sl2 int;r1 numeric;r2 numeric;outv numeric;
begin
thr:=floor(total_line)::int+1;
if(a+b)>=thr then return 1; end if;
select * into term from public.tt_is_terminal(a,b);
if term.is_terminal then return case when(a+b)>=thr then 1 else 0 end; end if;
if(a>=10 and b>=10) then return 1; end if;
create temp table if not exists tt_over_memo(memo_key text primary key,memo_val numeric not null) on commit preserve rows;
key:=concat_ws('|',a,b,next_server,serves_left,thr,ps,pr);
select memo_val into outv from tt_over_memo where memo_key=key;
if found then return outv; end if;
pn:=case when next_server='A' then ps else pr end;
a1:=a+1;b1:=b;select t.next_server,t.serves_left into ns1,sl1 from public.tt_advance_serve_state(a1,b1,next_server,serves_left) t;
a2:=a;b2:=b+1;select t.next_server,t.serves_left into ns2,sl2 from public.tt_advance_serve_state(a2,b2,next_server,serves_left) t;
if ns1 is null then raise exception 'null'; end if;
r1:=public.tt_over_prob_dp(a1,b1,ns1,sl1,ps,pr,total_line);r2:=public.tt_over_prob_dp(a2,b2,ns2,sl2,ps,pr,total_line);
outv:=pn*r1+(1-pn)*r2;
insert into tt_over_memo(memo_key,memo_val) values(key,outv) on conflict(memo_key) do update set memo_val=excluded.memo_val;
return outv;
end;
$f$;

-- Step 5: Views in dependency order

CREATE OR REPLACE VIEW public.tt_live_learned_probs AS
SELECT m.id AS match_id,
  (s.prior_ps*s.prior_strength::numeric+s.a_serve_wins_by_a::numeric)/(s.prior_strength+s.a_serve_points)::numeric AS ps,
  (s.prior_pr*s.prior_strength::numeric+s.b_serve_wins_by_a::numeric)/(s.prior_strength+s.b_serve_points)::numeric AS pr,
  s.a_serve_points, s.b_serve_points
FROM tt_matches m JOIN tt_serve_stats s ON s.match_id=m.id;

CREATE OR REPLACE VIEW public.tt_live_model AS
SELECT m.id AS match_id,
  tt_win_prob_dp(m.score_a,m.score_b,m.next_server,m.serves_left,p.ps,p.pr) AS win_prob_a
FROM tt_matches m JOIN tt_live_learned_probs p ON p.match_id=m.id;

CREATE OR REPLACE VIEW public.tt_match_list AS
SELECT m.id AS match_id,m.status,m.player_a,m.player_b,m.score_a,m.score_b,
  m.next_server,m.serves_left,x.win_prob_a,x.cover_m15,x.over_185,
  o.ml_a,o.spread_line,o.spread_a,o.total_line,o.over_odds,o.under_odds,
  american_to_break_even_prob(o.ml_a) AS ml_break_even,
  american_to_break_even_prob(o.spread_a) AS spread_break_even,
  american_to_break_even_prob(o.over_odds) AS over_break_even,
  x.win_prob_a-american_to_break_even_prob(o.ml_a) AS ml_edge,
  x.cover_m15-american_to_break_even_prob(o.spread_a) AS spread_edge,
  x.over_185-american_to_break_even_prob(o.over_odds) AS over_edge,
  x.updated_at AS metrics_updated_at
FROM tt_matches m LEFT JOIN tt_match_metrics x ON x.match_id=m.id
  LEFT JOIN tt_market_odds o ON o.match_id=m.id WHERE m.status='live';

CREATE OR REPLACE VIEW public.tt_admin_dashboard AS
SELECT m.id AS match_id,m.status,m.player_a,m.player_b,m.first_server,
  m.score_a,m.score_b,m.next_server,m.serves_left,m.edge_threshold,m.best_bet_threshold,
  o.ml_a,o.spread_line,o.spread_a,o.total_line,o.over_odds,o.under_odds,
  x.ps,x.pr,x.win_prob_a,x.cover_m05,x.cover_m15,x.cover_m25,x.cover_m35,x.cover_m45,
  x.over_165,x.over_175,x.over_185,x.over_195,x.over_205,
  american_to_break_even_prob(o.ml_a) AS ml_be,
  american_to_break_even_prob(o.spread_a) AS spread_be,
  american_to_break_even_prob(o.over_odds) AS over_be,
  american_to_break_even_prob(o.under_odds) AS under_be,
  x.win_prob_a-american_to_break_even_prob(o.ml_a) AS ml_edge,
  x.cover_m15-american_to_break_even_prob(o.spread_a) AS spread_edge_m15,
  x.over_185-american_to_break_even_prob(o.over_odds) AS over_edge_185,
  1::numeric-x.over_185-american_to_break_even_prob(o.under_odds) AS under_edge_185,
  CASE WHEN(x.cover_m15-american_to_break_even_prob(o.spread_a))>=m.best_bet_threshold THEN 'BEST_BET_SPREAD'
    WHEN(x.win_prob_a-american_to_break_even_prob(o.ml_a))>=m.best_bet_threshold THEN 'BEST_BET_ML'
    WHEN(x.over_185-american_to_break_even_prob(o.over_odds))>=m.best_bet_threshold THEN 'BEST_BET_OVER'
    WHEN(1::numeric-x.over_185-american_to_break_even_prob(o.under_odds))>=m.best_bet_threshold THEN 'BEST_BET_UNDER'
    ELSE 'NONE' END AS best_bet_tag,
  (x.cover_m15-american_to_break_even_prob(o.spread_a))>=m.edge_threshold AS bet_spread_m15,
  (x.win_prob_a-american_to_break_even_prob(o.ml_a))>=m.edge_threshold AS bet_ml,
  (x.over_185-american_to_break_even_prob(o.over_odds))>=m.edge_threshold AS bet_over_185,
  (1::numeric-x.over_185-american_to_break_even_prob(o.under_odds))>=m.edge_threshold AS bet_under_185,
  x.updated_at AS metrics_updated_at,m.updated_at AS match_updated_at
FROM tt_matches m LEFT JOIN tt_market_odds o ON o.match_id=m.id
  LEFT JOIN tt_match_metrics x ON x.match_id=m.id;

CREATE OR REPLACE VIEW public.tt_momentum_shock AS
SELECT match_id,score_a,score_b,win_prob_a,
  win_prob_a-lag(win_prob_a) OVER(PARTITION BY match_id ORDER BY created_at) AS win_prob_jump,
  cover_m15-lag(cover_m15) OVER(PARTITION BY match_id ORDER BY created_at) AS spread_jump,
  created_at FROM tt_prob_history;

CREATE OR REPLACE VIEW public.tt_momentum_signal AS
SELECT match_id,score_a,score_b,win_prob_a,win_prob_jump,spread_jump,created_at,
  CASE WHEN abs(win_prob_jump)>0.12 THEN 'SHOCK' WHEN abs(win_prob_jump)>0.08 THEN 'STRONG'
    WHEN abs(win_prob_jump)>0.05 THEN 'MODERATE' ELSE 'NORMAL' END AS momentum_level
FROM tt_momentum_shock;

CREATE OR REPLACE VIEW public.tt_best_opportunities AS
SELECT match_id,status,player_a,player_b,score_a,score_b,next_server,serves_left,
  win_prob_a,cover_m15,over_185,ml_a,spread_line,spread_a,total_line,over_odds,under_odds,
  ml_break_even,spread_break_even,over_break_even,ml_edge,spread_edge,over_edge,metrics_updated_at,
  GREATEST(COALESCE(ml_edge,'-999'::numeric),COALESCE(spread_edge,'-999'::numeric),COALESCE(over_edge,'-999'::numeric)) AS best_edge
FROM tt_match_list
ORDER BY GREATEST(COALESCE(ml_edge,'-999'::numeric),COALESCE(spread_edge,'-999'::numeric),COALESCE(over_edge,'-999'::numeric)) DESC NULLS LAST;

-- Step 6: Remaining functions that depend on views
CREATE OR REPLACE FUNCTION public.tt_recompute_metrics(p_match_id uuid)
 RETURNS void LANGUAGE plpgsql
AS $f$
declare m public.tt_matches%rowtype;lp record;
  v_ps numeric;v_pr numeric;winp numeric;c05 numeric;c15 numeric;c25 numeric;c35 numeric;c45 numeric;
  o165 numeric;o175 numeric;o185 numeric;o195 numeric;o205 numeric;
begin
  select * into m from public.tt_matches where id=p_match_id;
  select * into lp from public.tt_live_learned_probs where match_id=p_match_id;
  v_ps:=lp.ps;v_pr:=lp.pr;
  select s.win_prob_a,s.cover_m15,s.cover_m25,s.cover_m35,s.cover_m45,
    s.over_165,s.over_175,s.over_185,s.over_195,s.over_205
  into winp,c15,c25,c35,c45,o165,o175,o185,o195,o205
  from public.tt_state_matrix s
  where s.score_a=m.score_a and s.score_b=m.score_b and s.server=m.next_server and s.serves_left=m.serves_left
  order by abs(s.ps-v_ps)+abs(s.pr-v_pr) limit 1;
  c05:=winp;
  insert into public.tt_match_metrics(match_id,ps,pr,win_prob_a,cover_m05,cover_m15,cover_m25,cover_m35,cover_m45,over_165,over_175,over_185,over_195,over_205,updated_at)
  values(p_match_id,v_ps,v_pr,winp,c05,c15,c25,c35,c45,o165,o175,o185,o195,o205,now())
  on conflict(match_id) do update set ps=excluded.ps,pr=excluded.pr,win_prob_a=excluded.win_prob_a,
    cover_m05=excluded.cover_m05,cover_m15=excluded.cover_m15,cover_m25=excluded.cover_m25,
    cover_m35=excluded.cover_m35,cover_m45=excluded.cover_m45,
    over_165=excluded.over_165,over_175=excluded.over_175,over_185=excluded.over_185,
    over_195=excluded.over_195,over_205=excluded.over_205,updated_at=now();
  insert into public.tt_prob_history(match_id,score_a,score_b,win_prob_a,cover_m15,over_185)
  values(p_match_id,m.score_a,m.score_b,winp,c15,o185);
  update public.tt_matches set updated_at=now() where id=p_match_id;
end;
$f$;

CREATE OR REPLACE FUNCTION public.tt_rebuild_state_from_points(p_match_id uuid)
 RETURNS void LANGUAGE plpgsql
AS $f$
declare m public.tt_matches%rowtype;pt record;
  a int:=0;b int:=0;cs text;csl int:=2;ns text;nl int;
  asp int:=0;asw int:=0;bsp int:=0;bsw int:=0;
begin
  select * into m from public.tt_matches where id=p_match_id for update;
  cs:=m.first_server;csl:=2;
  for pt in select * from public.tt_points where match_id=p_match_id order by point_number loop
    if cs='A' then asp:=asp+1;if pt.winner='A' then asw:=asw+1; end if;
    else bsp:=bsp+1;if pt.winner='A' then bsw:=bsw+1; end if; end if;
    if pt.winner='A' then a:=a+1; else b:=b+1; end if;
    select t.next_server,t.serves_left into ns,nl from public.tt_advance_serve_state(a,b,cs,csl) t;
    cs:=ns;csl:=nl;
  end loop;
  update public.tt_matches set score_a=a,score_b=b,next_server=cs,serves_left=csl,
    status=case when(a>=11 and a-b>=2) or(b>=11 and b-a>=2) then 'ended' else 'live' end,updated_at=now()
  where id=p_match_id;
  update public.tt_serve_stats set a_serve_points=asp,a_serve_wins_by_a=asw,
    b_serve_points=bsp,b_serve_wins_by_a=bsw,updated_at=now() where match_id=p_match_id;
  perform public.tt_recompute_metrics(p_match_id);
end;
$f$;
