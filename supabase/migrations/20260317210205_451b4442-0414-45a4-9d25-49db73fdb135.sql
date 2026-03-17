-- Push notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_start boolean NOT NULL DEFAULT true,
  score_changes boolean NOT NULL DEFAULT false,
  lead_changes boolean NOT NULL DEFAULT false,
  tracked_prop_hit boolean NOT NULL DEFAULT true,
  tracked_prop_danger boolean NOT NULL DEFAULT true,
  slip_updates boolean NOT NULL DEFAULT true,
  live_opportunities boolean NOT NULL DEFAULT false,
  model_edge_alerts boolean NOT NULL DEFAULT false,
  quiet_mode boolean NOT NULL DEFAULT false,
  throttle_minutes integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification prefs"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Push device tokens for iOS/Android
CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own device tokens"
  ON public.push_device_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notification log for dedup/throttle
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered boolean DEFAULT false
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification log"
  ON public.notification_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);