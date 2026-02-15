
-- Function to search public profiles by username/display_name
CREATE OR REPLACE FUNCTION public.search_public_profiles(search_query text, max_results int DEFAULT 50)
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
  WHERE p.username ILIKE '%' || search_query || '%'
     OR p.display_name ILIKE '%' || search_query || '%'
  LIMIT max_results;
$$;

-- Function to get suggested public profiles (who share picks or astro)
CREATE OR REPLACE FUNCTION public.get_suggested_profiles(max_results int DEFAULT 50)
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
  WHERE p.share_picks = true OR p.share_astro = true
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION public.search_public_profiles(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suggested_profiles(int) TO authenticated;
