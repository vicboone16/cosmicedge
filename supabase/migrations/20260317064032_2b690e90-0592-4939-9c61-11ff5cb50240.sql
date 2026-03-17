
-- app_command_registry: stores which apps/repos are allowed
CREATE TABLE IF NOT EXISTS public.app_command_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug text NOT NULL UNIQUE,
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  allowed_commands text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_command_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read app_command_registry"
  ON public.app_command_registry FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- command_tasks: stores each command invocation
CREATE TABLE IF NOT EXISTS public.command_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug text NOT NULL REFERENCES public.app_command_registry(app_slug),
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  command_name text NOT NULL,
  command_payload jsonb NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'normal',
  created_by text,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  github_issue_number integer,
  github_issue_url text,
  output_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.command_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read command_tasks"
  ON public.command_tasks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed the cosmicedge registry row
INSERT INTO public.app_command_registry (app_slug, repo_owner, repo_name, allowed_commands)
VALUES ('cosmicedge', 'vicboone16', 'cosmicedge', ARRAY[
  'full-audit', 'data-integrity-check', 'model-accuracy-audit',
  'stat-mapping-audit', 'live-prop-readiness', 'roster-sync',
  'engine-diagnostics', 'environment-verify'
])
ON CONFLICT (app_slug) DO UPDATE SET
  repo_owner = EXCLUDED.repo_owner,
  repo_name = EXCLUDED.repo_name,
  allowed_commands = EXCLUDED.allowed_commands,
  updated_at = now();
