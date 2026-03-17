CREATE OR REPLACE VIEW public.v_game_possession_counts AS
SELECT
  game_id,
  max(league) AS league,
  count(*) FILTER (
    WHERE (
      event_type = ANY (ARRAY[
        'made_shot'::text,
        'free_throw_made'::text,
        'rebound_defensive'::text,
        'turnover'::text,
        'foul_offensive'::text,
        'jump_ball'::text
      ])
      OR (
        event_type = 'violation'::text
        AND possession_result = 'change_possession'::text
      )
    )
  ) AS estimated_possessions
FROM public.normalized_pbp_events e
GROUP BY game_id;