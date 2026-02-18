
-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2.5: Provider Kill Switches — provider_flags table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.provider_flags (
  provider_name text PRIMARY KEY,
  enabled       boolean NOT NULL DEFAULT true,
  reason        text,
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_by    uuid
);

-- Seed default providers
INSERT INTO public.provider_flags (provider_name, enabled)
VALUES
  ('odds',        true),
  ('stats',       true),
  ('injuries',    true),
  ('news',        true),
  ('astro',       true),
  ('live_scores', true),
  ('supabase',    true)
ON CONFLICT (provider_name) DO NOTHING;

ALTER TABLE public.provider_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can read flags (needed by frontend adapter)
CREATE POLICY "Provider flags are publicly readable"
  ON public.provider_flags FOR SELECT
  USING (true);

-- Only admins can update flags
CREATE POLICY "Admins can update provider flags"
  ON public.provider_flags FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 5: Audit Log table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid,
  action         text NOT NULL,
  entity_type    text,
  entity_id      text,
  before_data    jsonb,
  after_data     jsonb,
  correlation_id text,
  meta           jsonb,
  created_at     timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx  ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx   ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_created_idx  ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users can insert their own audit entries (non-blocking, fire-and-forget)
CREATE POLICY "Users can insert own audit entries"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admins can read all audit entries
CREATE POLICY "Admins can read audit log"
  ON public.audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 4: Health check diagnostics table (safe write test target)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.health_checks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL DEFAULT 'ping',
  status     text NOT NULL DEFAULT 'ok',
  meta       jsonb,
  checked_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages health checks"
  ON public.health_checks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read health checks"
  ON public.health_checks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
