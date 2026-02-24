-- Update status check constraint to include 'final'
ALTER TABLE public.tracked_props DROP CONSTRAINT tracked_props_status_check;
ALTER TABLE public.tracked_props ADD CONSTRAINT tracked_props_status_check 
  CHECK (status = ANY (ARRAY['pregame'::text, 'live'::text, 'hit'::text, 'missed'::text, 'push'::text, 'final'::text]));