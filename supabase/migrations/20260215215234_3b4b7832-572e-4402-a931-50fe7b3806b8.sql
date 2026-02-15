
-- Fix 1: Drop the old permissive profiles SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;

-- Fix 2: Replace the overly permissive nba_standings ALL policy with service-role scoped one
DROP POLICY IF EXISTS "Service role can manage standings" ON public.nba_standings;

CREATE POLICY "Service role can manage standings"
ON public.nba_standings
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);
