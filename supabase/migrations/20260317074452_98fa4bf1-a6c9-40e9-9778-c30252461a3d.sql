DROP POLICY IF EXISTS "Service can insert audit logs" ON public.audit_log;

CREATE POLICY "service_role_insert_only" ON public.audit_log
  FOR INSERT TO public
  WITH CHECK ((current_setting('role') = 'service_role') OR (user_id = auth.uid()));