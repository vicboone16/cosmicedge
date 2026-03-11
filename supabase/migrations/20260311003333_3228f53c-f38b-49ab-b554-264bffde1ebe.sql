
-- Helper: convert "MM:SS" or "M:SS" clock string to integer seconds
CREATE OR REPLACE FUNCTION public.mmss_to_seconds(p_clock text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_clock IS NULL THEN NULL
    WHEN p_clock ~ '^\d+:\d+$' THEN
      (split_part(p_clock, ':', 1)::int * 60) + split_part(p_clock, ':', 2)::int
    ELSE NULL
  END;
$$;
