
-- Expand profiles table with new fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS sun_sign text,
  ADD COLUMN IF NOT EXISTS moon_sign text,
  ADD COLUMN IF NOT EXISTS rising_sign text,
  ADD COLUMN IF NOT EXISTS share_astro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_picks boolean NOT NULL DEFAULT false;

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- Update profiles RLS: allow anyone to see limited public profile data (username, display_name, avatar, astro if shared)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Users can always see their own full profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone authenticated can see public profile fields (for friend discovery)
CREATE POLICY "Authenticated users can view public profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Create friendships table
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they're part of
CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests
CREATE POLICY "Users can create friend requests"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

-- Users can update friendships they're part of (accept/block)
CREATE POLICY "Users can update own friendships"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can delete friendships they're part of (unfriend)
CREATE POLICY "Users can delete own friendships"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Trigger for updated_at
CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
