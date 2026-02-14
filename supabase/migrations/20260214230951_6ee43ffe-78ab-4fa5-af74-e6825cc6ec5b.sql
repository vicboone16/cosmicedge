
-- Conversations table (supports 1-on-1 and group chats)
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT, -- null for 1-on-1, set for group chats
  is_group BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Conversation members
CREATE TABLE public.conversation_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  bet_id UUID REFERENCES public.bets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Social feed posts (140 char limit enforced via trigger)
CREATE TABLE public.feed_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT, -- max 140 chars, nullable if sharing a bet only
  bet_id UUID REFERENCES public.bets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

-- Feed comments
CREATE TABLE public.feed_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

-- Validation trigger for feed post content length
CREATE OR REPLACE FUNCTION public.validate_feed_post()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS NOT NULL AND length(NEW.content) > 140 THEN
    RAISE EXCEPTION 'Post content exceeds 140 characters';
  END IF;
  IF NEW.content IS NULL AND NEW.bet_id IS NULL THEN
    RAISE EXCEPTION 'Post must have content or a shared bet';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_feed_post_trigger
  BEFORE INSERT OR UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_feed_post();

-- RLS Policies

-- Conversations: members can see their conversations
CREATE POLICY "Members can view conversations"
  ON public.conversations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Conversation members: members can see other members of their conversations
CREATE POLICY "Members can view conversation members"
  ON public.conversation_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Conversation creator can add members"
  ON public.conversation_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can update their own read status"
  ON public.conversation_members FOR UPDATE
  USING (user_id = auth.uid());

-- Messages: members of conversation can read/write
CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

-- Feed posts: friends can see posts (use friendships table)
CREATE POLICY "Users can view friends posts"
  ON public.feed_posts FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
      AND (
        (f.requester_id = auth.uid() AND f.addressee_id = user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_id)
      )
    )
  );

CREATE POLICY "Users can create own posts"
  ON public.feed_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.feed_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Feed comments: visible if you can see the post
CREATE POLICY "Users can view comments on visible posts"
  ON public.feed_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_id
    AND (
      fp.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = fp.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = fp.user_id)
        )
      )
    )
  ));

CREATE POLICY "Users can comment on visible posts"
  ON public.feed_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_id
      AND (
        fp.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
          AND (
            (f.requester_id = auth.uid() AND f.addressee_id = fp.user_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = fp.user_id)
          )
        )
      )
    )
  );

CREATE POLICY "Users can delete own comments"
  ON public.feed_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Update timestamp trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
