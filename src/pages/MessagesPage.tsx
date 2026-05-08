import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

interface ConversationPreview {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user: { display_name: string; avatar_url: string; username: string } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
}

const MessagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    if (!user) return;

    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id) as any;

    if (!memberships || memberships.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convoIds = memberships.map((m: any) => m.conversation_id);
    const readMap = new Map(memberships.map((m: any) => [m.conversation_id, m.last_read_at]));

    const { data: convos } = await supabase
      .from("conversations")
      .select("id, name, is_group, created_at, updated_at")
      .in("id", convoIds)
      .order("updated_at", { ascending: false }) as any;

    if (!convos) { setLoading(false); return; }

    const previews: ConversationPreview[] = await Promise.all(
      convos.map(async (convo: any) => {
        // Other members
        const { data: members } = await supabase
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", convo.id)
          .neq("user_id", user.id) as any;

        let otherUser = null;
        if (members && members.length > 0 && !convo.is_group) {
          const { data: profileData } = await supabase
            .rpc("get_public_profiles", { user_ids: [members[0].user_id] }) as any;
          otherUser = profileData?.[0] ?? null;
        }

        // Last message
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at, sender_id")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1) as any;

        const lastReadAt = readMap.get(convo.id) as string | undefined;
        const lastMsgAt = lastMsg?.[0]?.created_at;
        const unread = !!(
          lastMsgAt &&
          lastMsg[0].sender_id !== user.id &&
          (!lastReadAt || new Date(lastMsgAt) > new Date(lastReadAt))
        );

        return {
          id: convo.id,
          name: convo.name,
          is_group: convo.is_group,
          other_user: otherUser,
          last_message: lastMsg?.[0]?.content ?? null,
          last_message_at: lastMsgAt ?? convo.created_at,
          unread,
        } as ConversationPreview;
      })
    );

    // Sort newest message first
    previews.sort((a, b) =>
      new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    );

    setConversations(previews);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadConversations();
  }, [user, loadConversations, navigate]);

  // Realtime: re-fetch conversation list when any message arrives in any of user's convos
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-list-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => { loadConversations(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadConversations]);

  const formatTime = (ts: string | null) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
    if (diffH < 24) return `${Math.floor(diffH)}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4 border-b border-border/50">
        <h1 className="text-xl font-bold font-display tracking-tight">Messages</h1>
      </header>

      <div className="px-4 pt-3 space-y-1.5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Go to Friends and tap the message icon to start a chat</p>
            <button
              onClick={() => navigate("/friends")}
              className="text-sm text-primary hover:underline font-medium"
            >
              Go to Friends →
            </button>
          </div>
        ) : (
          conversations.map(convo => {
            const name = convo.is_group
              ? convo.name || "Group Chat"
              : convo.other_user?.display_name || convo.other_user?.username || "User";
            const initial = name[0]?.toUpperCase() ?? "?";

            return (
              <button
                key={convo.id}
                onClick={() => navigate(`/messages/${convo.id}`)}
                className="w-full cosmic-card rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:border-primary/20 transition-all"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {convo.is_group ? (
                      <Users className="h-5 w-5 text-primary" />
                    ) : convo.other_user?.avatar_url ? (
                      <img src={convo.other_user.avatar_url} className="h-11 w-11 object-cover" alt="" />
                    ) : (
                      <span className="text-primary font-bold text-base">{initial}</span>
                    )}
                  </div>
                  {convo.unread && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-sm truncate ${convo.unread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                      {name}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                      {formatTime(convo.last_message_at)}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${convo.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {convo.last_message ?? "No messages yet"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
