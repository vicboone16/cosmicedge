
ALTER TABLE public.live_prop_state 
  ADD COLUMN IF NOT EXISTS astro_modifier numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS astro_note text DEFAULT null;
