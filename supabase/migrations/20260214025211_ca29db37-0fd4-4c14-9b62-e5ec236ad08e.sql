
-- Fix profiles table: drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;

-- Replace with a policy that allows viewing own profile OR accepted friends' profiles
CREATE POLICY "Users can view own or friends profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = profiles.user_id)
        OR (addressee_id = auth.uid() AND requester_id = profiles.user_id)
      )
    )
  );

-- Also drop the duplicate "Users can view own profile" since the new policy covers it
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
