
-- Step 1: Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;

-- Step 2: Create a policy that only allows users to read their OWN full profile
CREATE POLICY "Users can view own full profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Step 3: Create a public_profiles view with only safe fields
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  user_id,
  username,
  display_name,
  avatar_url,
  bio,
  share_astro,
  share_picks,
  CASE WHEN share_astro = true THEN sun_sign ELSE NULL END as sun_sign,
  CASE WHEN share_astro = true THEN moon_sign ELSE NULL END as moon_sign,
  CASE WHEN share_astro = true THEN rising_sign ELSE NULL END as rising_sign
FROM public.profiles;

-- Step 4: Grant access to the view
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
