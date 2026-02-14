import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Plus, Users } from "lucide-react";
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

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadConversations();
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;
    
    // Get all conversation IDs for this user
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

    // Get conversation details
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, name, is_group, created_at")
      .in("id", convoIds)
      .order("updated_at", { ascending: false }) as any;

    if (!convos) { setLoading(false); return; }

    // For each conversation, get other members and last message
    const previews: ConversationPreview[] = [];
    
    for (const convo of convos) {
      // Get other members
      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", convo.id)
        .neq("user_id", user.id) as any;

      let otherUser = null;
      if (members && members.length > 0 && !convo.is_group) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, username")
          .eq("user_id", members[0].user_id)
          .maybeSingle();
        otherUser = profile;
      }

      // Get last message
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1) as any;

      const lastReadAt = readMap.get(convo.id) as string | undefined;
      const unread = lastMsg && lastMsg.length > 0 && lastReadAt && new Date(lastMsg[0].created_at) > new Date(lastReadAt);

      previews.push({
        id: convo.id,
        name: convo.name,
        is_group: convo.is_group,
        other_user: otherUser as ConversationPreview["other_user"],
        last_message: lastMsg?.[0]?.content || null,
        last_message_at: lastMsg?.[0]?.created_at || convo.created_at,
        unread: !!unread,
      });
    }

    setConversations(previews);
    setLoading(false);
  };

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
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold font-display tracking-tight">Messages</h1>
        </div>
      </header>

      <div className="px-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Visit a friend's profile to start a conversation</p>
            <button onClick={() => navigate("/friends")} className="text-sm text-primary hover:underline">
              Go to Friends
            </button>
          </div>
        ) : (
          conversations.map(convo => (
            <button
              key={convo.id}
              onClick={() => navigate(`/messages/${convo.id}`)}
              className="w-full cosmic-card rounded-xl p-4 flex items-center gap-3 text-left hover:border-primary/20 transition-all"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {convo.is_group ? (
                  <Users className="h-5 w-5 text-primary" />
                ) : convo.other_user?.avatar_url ? (
                  <img src={convo.other_user.avatar_url} className="h-10 w-10 rounded-full object-cover" alt="" />
                ) : (
                  <span className="text-primary font-bold text-sm">
                    {(convo.other_user?.display_name || convo.name || "?")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium truncate ${convo.unread ? "text-foreground" : ""}`}>
                    {convo.is_group ? convo.name || "Group Chat" : convo.other_user?.display_name || convo.other_user?.username || "User"}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {formatTime(convo.last_message_at)}
                  </span>
                </div>
                {convo.last_message && (
                  <p className={`text-xs truncate ${convo.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {convo.last_message}
                  </p>
                )}
              </div>
              {convo.unread && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
