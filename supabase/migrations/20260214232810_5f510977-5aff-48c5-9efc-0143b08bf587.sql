
-- Fix circular dependency: conversations RLS references conversation_members and vice versa.
-- Solution: Use a helper function to break the direct table dependency in RLS policies.

-- Helper function to check conversation membership
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

-- Drop existing policies that cause circular references
DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Members can view conversation members" ON public.conversation_members;
DROP POLICY IF EXISTS "Conversation creator can add members" ON public.conversation_members;
DROP POLICY IF EXISTS "Members can update their own read status" ON public.conversation_members;
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;

-- Recreate policies using the helper function (breaks cycle)
CREATE POLICY "Members can view conversations"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_member(id, auth.uid()));

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Members can view conversation members"
  ON public.conversation_members FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

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

CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_member(conversation_id, auth.uid())
  );
