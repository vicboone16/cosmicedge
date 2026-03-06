-- Bring Test play_by_play schema to parity with Live so publish diff is non-destructive
ALTER TABLE public.play_by_play
  ADD COLUMN IF NOT EXISTS clock_seconds integer,
  ADD COLUMN IF NOT EXISTS seconds_remaining_game integer,
  ADD COLUMN IF NOT EXISTS seconds_elapsed_game integer;

-- Recreate Live view chain in Test
CREATE OR REPLACE VIEW public.play_by_play_ordered AS
SELECT
  id,
  game_id,
  sequence,
  quarter,
  clock,
  event_type,
  description,
  team_abbr,
  player_id,
  assist_player_id,
  home_score,
  away_score,
  created_at,
  clock_seconds,
  seconds_remaining_game,
  seconds_elapsed_game,
  row_number() OVER (
    PARTITION BY game_id
    ORDER BY seconds_elapsed_game, sequence
  ) AS event_index
FROM public.play_by_play;

CREATE OR REPLACE VIEW public.play_by_play_scores AS
SELECT
  game_id,
  seconds_elapsed_game,
  max(home_score) OVER (
    PARTITION BY game_id
    ORDER BY seconds_elapsed_game
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS home_score_corrected,
  max(away_score) OVER (
    PARTITION BY game_id
    ORDER BY seconds_elapsed_game
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS away_score_corrected
FROM public.play_by_play_ordered;

CREATE OR REPLACE VIEW public.play_by_play_quarter_corrected AS
SELECT
  id,
  game_id,
  sequence,
  quarter,
  clock,
  event_type,
  description,
  team_abbr,
  player_id,
  assist_player_id,
  home_score,
  away_score,
  created_at,
  clock_seconds,
  seconds_remaining_game,
  seconds_elapsed_game,
  event_index,
  CASE
    WHEN seconds_elapsed_game < 720 THEN 1
    WHEN seconds_elapsed_game < 1440 THEN 2
    WHEN seconds_elapsed_game < 2160 THEN 3
    WHEN seconds_elapsed_game < 2880 THEN 4
    ELSE 5
  END AS quarter_corrected
FROM public.play_by_play_ordered;