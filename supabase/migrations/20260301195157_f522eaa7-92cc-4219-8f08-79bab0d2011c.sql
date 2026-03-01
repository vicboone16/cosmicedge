-- Fix 3: Harden profiles table RLS
-- Tighten INSERT policy to authenticated only (handle_new_user trigger is SECURITY DEFINER and bypasses RLS)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
