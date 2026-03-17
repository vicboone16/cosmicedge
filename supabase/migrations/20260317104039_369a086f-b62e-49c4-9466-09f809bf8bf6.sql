DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'game_live_wp_id_seq'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'game_live_wp_id_seq1'
  ) THEN
    EXECUTE 'ALTER SEQUENCE public.game_live_wp_id_seq RENAME TO game_live_wp_id_seq1';
  END IF;
END
$$;