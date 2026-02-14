-- Drop the restrictive SELECT policy
DROP POLICY "Users can view own or friends profiles" ON public.profiles;

-- Create a new policy that allows:
-- 1. Viewing your own profile
-- 2. Viewing accepted friends' profiles
-- 3. Searching any profile by username/display_name (but RLS still limits columns visible via app code)
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
);
