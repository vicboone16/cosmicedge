
-- Fix: Change view to SECURITY INVOKER so it uses the querying user's permissions
ALTER VIEW public.public_profiles SET (security_invoker = on);
