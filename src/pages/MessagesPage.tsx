import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Plus, Users, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ConversationPreview {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user: { display_name: string; avatar_url: string; username: string } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
}

interface Friend {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
}

const MessagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [startingWith, setStartingWith] = useState<string | null>(null);

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
        const { data: profileData } = await supabase
          .rpc("get_public_profiles", { user_ids: [members[0].user_id] }) as any;
        otherUser = profileData && profileData.length > 0 ? profileData[0] : null;
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

  const loadFriends = async () => {
    if (!user) return;
    const { data: rows } = await supabase
      .from("friendships")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`) as any;

    if (!rows || rows.length === 0) { setFriends([]); return; }

    const friendIds = rows.map((r: any) =>
      r.requester_id === user.id ? r.recipient_id : r.requester_id
    );
    const { data: profiles } = await supabase
      .rpc("get_public_profiles", { user_ids: friendIds }) as any;

    setFriends((profiles as Friend[]) || []);
  };

  const startConversation = async (friendId: string) => {
    if (!user || startingWith) return;
    setStartingWith(friendId);

    // Check for existing 1:1 conversation
    const { data: myConvos } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id) as any;

    if (myConvos && myConvos.length > 0) {
      const { data: theirConvos } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", friendId)
        .in("conversation_id", myConvos.map((c: any) => c.conversation_id)) as any;

      if (theirConvos && theirConvos.length > 0) {
        const { data: convo } = await supabase
          .from("conversations")
          .select("id, is_group")
          .eq("id", theirConvos[0].conversation_id)
          .eq("is_group", false)
          .maybeSingle() as any;

        if (convo) {
          setStartingWith(null);
          setComposing(false);
          navigate(`/messages/${convo.id}`);
          return;
        }
      }
    }

    const { data: newConvo, error } = await supabase
      .from("conversations")
      .insert({ created_by: user.id, is_group: false } as any)
      .select("id")
      .single() as any;

    if (error || !newConvo) {
      toast({ title: "Couldn't start conversation", variant: "destructive" });
      setStartingWith(null);
      return;
    }

    await supabase.from("conversation_members").insert([
      { conversation_id: newConvo.id, user_id: user.id },
      { conversation_id: newConvo.id, user_id: friendId },
    ] as any);

    setStartingWith(null);
    setComposing(false);
    navigate(`/messages/${newConvo.id}`);
  };

  const openCompose = () => {
    setFriendSearch("");
    loadFriends();
    setComposing(true);
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

  const filteredFriends = friends.filter(f =>
    !friendSearch ||
    f.display_name?.toLowerCase().includes(friendSearch.toLowerCase()) ||
    f.username?.toLowerCase().includes(friendSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-24">
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold font-display tracking-tight flex-1">Messages</h1>
          <button
            onClick={openCompose}
            className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
            title="New message"
          >
            <Plus className="h-5 w-5 text-primary" />
          </button>
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

      {/* Compose bottom sheet */}
      {composing && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setComposing(false)} />
          <div className="relative z-10 bg-background rounded-t-2xl border-t border-border pb-safe">
            <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                type="text"
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                placeholder="Search friends…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={() => setComposing(false)} className="p-1">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-72 py-2">
              {filteredFriends.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  {friends.length === 0 ? "No friends yet — add some from the Friends page" : "No matches"}
                </p>
              ) : (
                filteredFriends.map(f => (
                  <button
                    key={f.user_id}
                    onClick={() => startConversation(f.user_id)}
                    disabled={startingWith === f.user_id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} className="h-9 w-9 rounded-full object-cover" alt="" />
                      ) : (
                        <span className="text-primary font-bold text-sm">{(f.display_name || f.username || "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{f.display_name || f.username}</p>
                      {f.username && <p className="text-xs text-muted-foreground">@{f.username}</p>}
                    </div>
                    {startingWith === f.user_id && (
                      <div className="ml-auto animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;
