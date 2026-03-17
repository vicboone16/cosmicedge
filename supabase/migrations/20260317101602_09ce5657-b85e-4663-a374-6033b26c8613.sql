
-- Neutralize the broken view chain: drop non-v2 views so the old migration's
-- output doesn't persist in the schema diff. The v2 views already exist in both envs.
DROP VIEW IF EXISTS public.v_nba_pbp_momentum CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_debug CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_pace_proxy CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_player_involvement CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_scoring_droughts CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_recent_runs CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_latest_possession CASCADE;
DROP VIEW IF EXISTS public.v_nba_pbp_source CASCADE;
DROP VIEW IF EXISTS public.v_game_snapshot_latest CASCADE;
