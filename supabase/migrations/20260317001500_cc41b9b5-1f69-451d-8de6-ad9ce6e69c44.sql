
-- =============================================================
-- Sync Test schema to match Live: add missing tables, columns, views
-- =============================================================

-- 1) Missing tables from Live
CREATE TABLE IF NOT EXISTS public.play_by_play_raw (
  game_id integer,
  event_id integer,
  period integer,
  clock text,
  player_name text,
  play_json jsonb
);

CREATE TABLE IF NOT EXISTS public.live_player_tracking (
  game_id integer,
  player_name text,
  minutes_played double precision,
  points integer,
  rebounds integer,
  assists integer,
  steals integer,
  blocks integer,
  turnovers integer,
  two_pa integer,
  three_pa integer,
  fta integer
);

CREATE TABLE IF NOT EXISTS public.live_player_stats (
  player_id integer,
  game_id integer,
  points integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  turnovers integer DEFAULT 0,
  two_pa integer DEFAULT 0,
  two_pm integer DEFAULT 0,
  three_pa integer DEFAULT 0,
  three_pm integer DEFAULT 0,
  fantasy_score double precision
);

-- 2) Missing columns on astra_command_center_state
ALTER TABLE public.astra_command_center_state
  ADD COLUMN IF NOT EXISTS mode_key text,
  ADD COLUMN IF NOT EXISTS market_climate text,
  ADD COLUMN IF NOT EXISTS cosmic_climate text,
  ADD COLUMN IF NOT EXISTS active_bias text,
  ADD COLUMN IF NOT EXISTS top_live_opportunity_id uuid,
  ADD COLUMN IF NOT EXISTS top_safe_play_id uuid,
  ADD COLUMN IF NOT EXISTS top_upside_play_id uuid,
  ADD COLUMN IF NOT EXISTS top_trap_alert_id uuid,
  ADD COLUMN IF NOT EXISTS weakest_slip_id uuid,
  ADD COLUMN IF NOT EXISTS weakest_leg_id uuid,
  ADD COLUMN IF NOT EXISTS live_opportunity_count integer,
  ADD COLUMN IF NOT EXISTS active_trap_count integer,
  ADD COLUMN IF NOT EXISTS active_cosmic_window_count integer,
  ADD COLUMN IF NOT EXISTS active_watchlist_count integer,
  ADD COLUMN IF NOT EXISTS command_summary text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 3) Missing columns on astra_operating_modes
ALTER TABLE public.astra_operating_modes
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS mode_description text,
  ADD COLUMN IF NOT EXISTS accent_label text,
  ADD COLUMN IF NOT EXISTS tone_style text,
  ADD COLUMN IF NOT EXISTS strong_yes_min_ev numeric,
  ADD COLUMN IF NOT EXISTS playable_min_ev numeric,
  ADD COLUMN IF NOT EXISTS lean_min_ev numeric,
  ADD COLUMN IF NOT EXISTS pass_below_ev numeric,
  ADD COLUMN IF NOT EXISTS strong_yes_min_hit_prob numeric,
  ADD COLUMN IF NOT EXISTS playable_min_hit_prob numeric,
  ADD COLUMN IF NOT EXISTS lean_min_hit_prob numeric,
  ADD COLUMN IF NOT EXISTS weight_ev numeric,
  ADD COLUMN IF NOT EXISTS weight_hit_probability numeric,
  ADD COLUMN IF NOT EXISTS weight_projection numeric,
  ADD COLUMN IF NOT EXISTS weight_minutes_security numeric,
  ADD COLUMN IF NOT EXISTS weight_correlation_risk numeric,
  ADD COLUMN IF NOT EXISTS weight_game_momentum numeric,
  ADD COLUMN IF NOT EXISTS weight_player_momentum numeric,
  ADD COLUMN IF NOT EXISTS weight_opportunity_score numeric,
  ADD COLUMN IF NOT EXISTS weight_trap_risk numeric,
  ADD COLUMN IF NOT EXISTS weight_volatility numeric,
  ADD COLUMN IF NOT EXISTS weight_astro_signal numeric,
  ADD COLUMN IF NOT EXISTS weight_cosmic_alignment numeric,
  ADD COLUMN IF NOT EXISTS prioritize_hidden_value boolean,
  ADD COLUMN IF NOT EXISTS prioritize_risk_reduction boolean,
  ADD COLUMN IF NOT EXISTS prioritize_trap_detection boolean,
  ADD COLUMN IF NOT EXISTS prioritize_live_entries boolean,
  ADD COLUMN IF NOT EXISTS emphasize_cosmic_language boolean,
  ADD COLUMN IF NOT EXISTS emphasize_quant_language boolean,
  ADD COLUMN IF NOT EXISTS show_cosmic_panel boolean,
  ADD COLUMN IF NOT EXISTS show_trap_alerts boolean,
  ADD COLUMN IF NOT EXISTS show_opportunity_feed boolean,
  ADD COLUMN IF NOT EXISTS show_mode_specific_badges boolean,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 4) Missing views (in dependency order)
CREATE OR REPLACE VIEW public.parsed_events AS
SELECT game_id, event_id, period, clock, player_name,
  play_json ->> 'description' AS play_text,
  CASE
    WHEN (play_json ->> 'description') ~~* '%makes 3-pt%' THEN '3PM'
    WHEN (play_json ->> 'description') ~~* '%misses 3-pt%' THEN '3PA'
    WHEN (play_json ->> 'description') ~~* '%makes%' AND (play_json ->> 'description') !~~* '%free throw%' THEN '2PM'
    WHEN (play_json ->> 'description') ~~* '%misses%' AND (play_json ->> 'description') !~~* '%3-pt%' AND (play_json ->> 'description') !~~* '%free throw%' THEN '2PA'
    WHEN (play_json ->> 'description') ~~* '%makes free throw%' THEN 'FTM'
    WHEN (play_json ->> 'description') ~~* '%misses free throw%' THEN 'FTA'
    WHEN (play_json ->> 'description') ~~* '%offensive rebound%' THEN 'OREB'
    WHEN (play_json ->> 'description') ~~* '%defensive rebound%' THEN 'DREB'
    WHEN (play_json ->> 'description') ~~* '%assist%' THEN 'AST'
    WHEN (play_json ->> 'description') ~~* '%steal%' THEN 'STL'
    WHEN (play_json ->> 'description') ~~* '%block%' THEN 'BLK'
    WHEN (play_json ->> 'description') ~~* '%turnover%' THEN 'TO'
    ELSE 'OTHER'
  END AS event_type
FROM play_by_play_raw;

CREATE OR REPLACE VIEW public.player_event_stats AS
SELECT game_id, player_name, period,
  sum(CASE WHEN event_type = '2PM' THEN 2 ELSE 0 END) +
  sum(CASE WHEN event_type = '3PM' THEN 3 ELSE 0 END) +
  sum(CASE WHEN event_type = 'FTM' THEN 1 ELSE 0 END) AS points,
  count(*) FILTER (WHERE event_type = 'OREB') + count(*) FILTER (WHERE event_type = 'DREB') AS rebounds,
  count(*) FILTER (WHERE event_type = 'AST') AS assists,
  count(*) FILTER (WHERE event_type = 'STL') AS steals,
  count(*) FILTER (WHERE event_type = 'BLK') AS blocks,
  count(*) FILTER (WHERE event_type = 'TO') AS turnovers,
  count(*) FILTER (WHERE event_type = '2PA') + count(*) FILTER (WHERE event_type = '2PM') AS two_pa,
  count(*) FILTER (WHERE event_type = '3PA') + count(*) FILTER (WHERE event_type = '3PM') AS three_pa,
  count(*) FILTER (WHERE event_type = 'FTA') + count(*) FILTER (WHERE event_type = 'FTM') AS fta
FROM parsed_events
GROUP BY game_id, player_name, period;

CREATE OR REPLACE VIEW public.live_player_rates AS
SELECT player_name,
  points::double precision / NULLIF(minutes_played, 0) AS points_per_min,
  rebounds::double precision / NULLIF(minutes_played, 0) AS rebounds_per_min,
  assists::double precision / NULLIF(minutes_played, 0) AS assists_per_min,
  two_pa::double precision / NULLIF(minutes_played, 0) AS two_pa_per_min,
  three_pa::double precision / NULLIF(minutes_played, 0) AS three_pa_per_min
FROM live_player_tracking;

CREATE OR REPLACE VIEW public.live_player_projections AS
SELECT t.player_name,
  t.points::double precision + r.points_per_min * (48 - t.minutes_played) AS projected_points,
  t.rebounds::double precision + r.rebounds_per_min * (48 - t.minutes_played) AS projected_rebounds,
  t.assists::double precision + r.assists_per_min * (48 - t.minutes_played) AS projected_assists
FROM live_player_tracking t
JOIN live_player_rates r ON t.player_name = r.player_name;

CREATE OR REPLACE VIEW public.v_astra_ritual_center AS
SELECT c.user_id, c.mode_key, m.mode_name, m.mode_description, m.icon_name, m.tone_style,
  c.market_climate, c.cosmic_climate, c.active_bias,
  c.top_live_opportunity_id, c.top_safe_play_id, c.top_upside_play_id,
  c.top_trap_alert_id, c.weakest_slip_id, c.weakest_leg_id,
  c.live_opportunity_count, c.active_trap_count,
  c.active_cosmic_window_count, c.active_watchlist_count,
  c.command_summary, c.summary_generated_at, c.updated_at
FROM astra_command_center_state c
JOIN astra_operating_modes m ON c.mode_key = m.mode_key;
