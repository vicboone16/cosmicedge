
-- Create a temporary function to bypass any issues and backfill game_ids
CREATE OR REPLACE FUNCTION public.tmp_backfill_slip_game_ids()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Slip 8a95d8b4: all picks → MIN@OKC live game
  UPDATE bet_slip_picks SET game_id = 'd3558098-99c1-4bf3-b048-a8931b8ea1f9'
  WHERE slip_id = '8a95d8b4-db6b-482b-8a78-74d590e005fb' AND game_id IS NULL;
  
  -- Slip 4a89f4b5: SGA, Naz Reid, Dort → MIN@OKC
  UPDATE bet_slip_picks SET game_id = 'd3558098-99c1-4bf3-b048-a8931b8ea1f9'
  WHERE slip_id = '4a89f4b5-0614-428c-9d88-afad5aa0da6a' 
  AND player_name_raw IN ('Shai Gilgeous-Alexander', 'Naz Reid', 'Luguentz Dort') AND game_id IS NULL;
  
  -- Slip 81409a84: Donovan Mitchell + James Harden + Cooper Flagg → DAL@CLE
  UPDATE bet_slip_picks SET game_id = '3d0f532c-e304-415c-a4a4-c763aabcb074'
  WHERE slip_id = '81409a84-cf13-4c26-97da-dc3311586a01' 
  AND player_name_raw IN ('Donovan Mitchell', 'James Harden', 'Cooper Flagg') AND game_id IS NULL;
  
  -- Giannis → IND@MIL
  UPDATE bet_slip_picks SET game_id = '81d09e5c-0687-4b54-ad54-fb62f8db90a7'
  WHERE slip_id = '81409a84-cf13-4c26-97da-dc3311586a01' 
  AND player_name_raw = 'Giannis Antetokounmpo' AND game_id IS NULL;
  
  -- Jakob Poeltl + Scottie Barnes → DET@TOR
  UPDATE bet_slip_picks SET game_id = 'f88fff0e-19a2-4e03-b900-49d58fe102d6'
  WHERE slip_id = '81409a84-cf13-4c26-97da-dc3311586a01' 
  AND player_name_raw IN ('Jakob Poeltl', 'Scottie Barnes') AND game_id IS NULL;
  
  -- Slip f05e894b: Duncan Robinson + Caris LeVert (DET) → DET@TOR
  UPDATE bet_slip_picks SET game_id = 'f88fff0e-19a2-4e03-b900-49d58fe102d6'
  WHERE slip_id = 'f05e894b-88a9-4311-ab55-033baf91c385' 
  AND player_name_raw IN ('Duncan Robinson', 'Caris LeVert', 'Jakob Poeltl', 'Scottie Barnes') AND game_id IS NULL;
END;
$$;

SELECT public.tmp_backfill_slip_game_ids();
DROP FUNCTION public.tmp_backfill_slip_game_ids();
