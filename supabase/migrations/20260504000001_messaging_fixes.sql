-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_messages_convo_created
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_user
  ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON public.conversations(updated_at DESC);

-- Delete policies (were missing)
CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = sender_id);

CREATE POLICY "Members can leave conversations"
  ON public.conversation_members FOR DELETE
  USING (auth.uid() = user_id);

-- Single-query unread conversation count
CREATE OR REPLACE FUNCTION public.get_unread_conversation_count()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $func$
  SELECT COUNT(*)::int
  FROM conversation_members cm
  WHERE cm.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = cm.conversation_id
        AND m.sender_id != auth.uid()
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
    );
$func$;

-- Single-query conversation previews
CREATE OR REPLACE FUNCTION public.get_conversation_previews()
RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  is_group           BOOLEAN,
  updated_at         TIMESTAMPTZ,
  last_message       TEXT,
  last_message_at    TIMESTAMPTZ,
  has_unread         BOOLEAN,
  other_user_id      UUID,
  other_display_name TEXT,
  other_username     TEXT,
  other_avatar_url   TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $func$
  WITH my_convos AS (
    SELECT cm.conversation_id, cm.last_read_at
    FROM   conversation_members cm
    WHERE  cm.user_id = auth.uid()
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content    AS last_message,
      m.created_at AS last_message_at,
      m.sender_id
    FROM   messages m
    WHERE  m.conversation_id IN (SELECT conversation_id FROM my_convos)
    ORDER  BY m.conversation_id, m.created_at DESC
  ),
  other_members AS (
    SELECT DISTINCT ON (cm.conversation_id)
      cm.conversation_id,
      cm.user_id AS other_user_id
    FROM   conversation_members cm
    WHERE  cm.conversation_id IN (SELECT conversation_id FROM my_convos)
      AND  cm.user_id != auth.uid()
    ORDER  BY cm.conversation_id
  ),
  other_profiles AS (
    SELECT
      om.conversation_id,
      om.other_user_id,
      up.display_name,
      up.username,
      up.avatar_url
    FROM   other_members om
    LEFT JOIN profiles up ON up.user_id = om.other_user_id
  )
  SELECT
    c.id,
    c.name,
    c.is_group,
    c.updated_at,
    lm.last_message,
    lm.last_message_at,
    (lm.last_message_at IS NOT NULL
      AND lm.sender_id != auth.uid()
      AND lm.last_message_at > COALESCE(mc.last_read_at, '1970-01-01'::timestamptz)
    ) AS has_unread,
    op.other_user_id,
    op.display_name AS other_display_name,
    op.username     AS other_username,
    op.avatar_url   AS other_avatar_url
  FROM   my_convos mc
  JOIN   conversations c   ON c.id = mc.conversation_id
  LEFT JOIN last_msgs lm   ON lm.conversation_id = c.id
  LEFT JOIN other_profiles op ON op.conversation_id = c.id
  ORDER  BY COALESCE(lm.last_message_at, c.updated_at) DESC;
$func$;
