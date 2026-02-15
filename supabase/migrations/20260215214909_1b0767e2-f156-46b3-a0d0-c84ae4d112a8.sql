
-- Drop the security invoker view since it can't read other users' profiles
DROP VIEW IF EXISTS public.public_profiles;

-- Create a SECURITY DEFINER function to safely return public profile data
CREATE OR REPLACE FUNCTION public.get_public_profiles(user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  share_astro boolean,
  share_picks boolean,
  sun_sign text,
  moon_sign text,
  rising_sign text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.share_astro,
    p.share_picks,
    CASE WHEN p.share_astro = true THEN p.sun_sign ELSE NULL END,
    CASE WHEN p.share_astro = true THEN p.moon_sign ELSE NULL END,
    CASE WHEN p.share_astro = true THEN p.rising_sign ELSE NULL END
  FROM public.profiles p
  WHERE p.user_id = ANY(user_ids);
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;
