-- Publish repair: align Test view reloptions with current Live to prevent dependency-breaking DROP/CREATE during publish.
-- Live currently has security_invoker=true only on the CE policy views listed below.

DO $$
DECLARE
  v record;
BEGIN
  -- Reset security_invoker on all public views except the CE views that should keep it.
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.reloptions IS NOT NULL
      AND c.reloptions::text[] @> ARRAY['security_invoker=true']
      AND c.relname NOT IN (
        'ce_correlation_flags',
        'ce_monte_input_heavy_v5',
        'ce_monte_input_supermodel',
        'ce_scorecards_fast_v9',
        'ce_scorecards_top_25_v4',
        'ce_scorecards_top_v4',
        'ce_supermodel',
        'ce_supermodel_top_plays'
      )
  LOOP
    EXECUTE format('ALTER VIEW IF EXISTS public.%I RESET (security_invoker);', v.relname);
  END LOOP;

  -- Re-assert the CE views that must keep security_invoker=true.
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_correlation_flags SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_monte_input_heavy_v5 SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_monte_input_supermodel SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_scorecards_fast_v9 SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_scorecards_top_25_v4 SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_scorecards_top_v4 SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_supermodel SET (security_invoker=true)';
  EXECUTE 'ALTER VIEW IF EXISTS public.ce_supermodel_top_plays SET (security_invoker=true)';
END
$$;