-- Enhanced check_schema_parity: adds view dependency + trigger conflict + stale function checks
CREATE OR REPLACE FUNCTION public.check_schema_parity()
RETURNS TABLE(object_type text, object_name text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Tables with RLS disabled
  RETURN QUERY
  SELECT 'table'::text, c.relname::text, 'RLS is disabled'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND c.relname NOT IN ('schema_migrations', 'spatial_ref_sys')
  ORDER BY c.relname;

  -- 2. Sequence naming drift
  RETURN QUERY
  SELECT 'sequence'::text, c.relname::text, 'Sequence name contains digit suffix — possible drift'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
    AND c.relname ~ '[0-9]$'
    AND c.relname NOT LIKE '%_id_seq'
  ORDER BY c.relname;

  -- 3. Triggers on reserved schemas
  RETURN QUERY
  SELECT 'trigger'::text, t.tgname::text,
    ('Trigger on reserved schema: ' || n.nspname || '.' || c.relname)::text
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('auth', 'storage', 'realtime', 'supabase_functions')
    AND NOT t.tgisinternal
  ORDER BY n.nspname, c.relname;

  -- 4. SECURITY DEFINER functions without search_path
  RETURN QUERY
  SELECT 'function'::text, p.proname::text,
    'SECURITY DEFINER without explicit search_path'::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
    )
  ORDER BY p.proname;

  -- 5. Views without security_invoker
  RETURN QUERY
  SELECT 'view'::text, c.relname::text,
    'View lacks security_invoker=true — may bypass RLS'::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND (c.reloptions IS NULL OR NOT c.reloptions::text[] @> ARRAY['security_invoker=true'])
    AND c.relname NOT LIKE 'pg_%'
  ORDER BY c.relname;
END;
$$;