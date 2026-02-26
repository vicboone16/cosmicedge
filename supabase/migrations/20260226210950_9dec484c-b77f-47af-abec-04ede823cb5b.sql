
-- Enable RLS on audit_log table
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow inserts from service role / triggers (no user restriction needed)
CREATE POLICY "Service can insert audit logs"
ON public.audit_log
FOR INSERT
WITH CHECK (true);
