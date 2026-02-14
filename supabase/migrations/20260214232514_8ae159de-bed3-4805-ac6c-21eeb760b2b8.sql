
-- This migration ensures the social tables are properly configured.
-- Tables already exist from a previous migration; this is a no-op safety net.

-- Ensure realtime is enabled for messages
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
