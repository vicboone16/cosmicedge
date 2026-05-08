import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Plus, Users, Search, X, Trash2, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface ConversationPreview {
  id: string;
  name: string | null;
  is_group: boolean;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  has_unread: boolean;
  other_user_id: string | null;
  other_display_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
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
  const qc = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [startingWith, setStartingWith] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate("/auth"); }
  }, [user]);

  /* ── Single-query conversation list ── */
  const { data: conversations = [], isLoading } = useQuery<ConversationPreview[]>({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any).rpc("get_conversation_previews");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 10_000,
  });

  /* ── Realtime: refresh list when any message is inserted ── */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-list-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["conversations", user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  /* ── Delete thread (leave conversation) ── */
  const deleteThread = useCallback(async (convoId: string) => {
    if (!user || deleting) return;
    setDeleting(convoId);
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", convoId)
      .eq("user_id", user.id) as any;

    if (error) {
      toast({ title: "Couldn't delete thread", variant: "destructive" });
    } else {
      qc.setQueryData<ConversationPreview[]>(
        ["conversations", user.id],
        (prev) => (prev || []).filter(c => c.id !== convoId)
      );
      qc.invalidateQueries({ queryKey: ["unread-messages", user.id] });
    }
    setDeleting(null);
  }, [user?.id, deleting]);

  /* ── Friends for compose ── */
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
    const { data: profiles } = await (supabase as any)
      .rpc("get_public_profiles", { user_ids: friendIds });
    setFriends((profiles as Friend[]) || []);
  };

  const startConversation = async (friendId: string) => {
    if (!user || startingWith) return;
    setStartingWith(friendId);

    // Look for existing 1:1 conversation
    const { data: myConvos } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id) as any;

    if (myConvos?.length) {
      const { data: shared } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", friendId)
        .in("conversation_id", myConvos.map((c: any) => c.conversation_id)) as any;

      if (shared?.length) {
        const { data: convo } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", shared[0].conversation_id)
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
    const diffH = (Date.now() - d.getTime()) / 3_600_000;
    if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}m`;
    if (diffH < 24) return `${Math.floor(diffH)}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const displayName = (c: ConversationPreview) =>
    c.is_group ? (c.name || "Group Chat") : (c.other_display_name || c.other_username || "User");

  const filteredFriends = friends.filter(f =>
    !friendSearch ||
    f.display_name?.toLowerCase().includes(friendSearch.toLowerCase()) ||
    f.username?.toLowerCase().includes(friendSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-bold font-display tracking-tight flex-1">Messages</h1>
          {conversations.length > 0 && (
            <button
              onClick={() => setEditMode(e => !e)}
              className="text-xs font-medium text-primary px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
            >
              {editMode ? "Done" : "Edit"}
            </button>
          )}
          <button
            onClick={openCompose}
            className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
            title="New message"
          >
            <Plus className="h-5 w-5 text-primary" />
          </button>
        </div>
      </header>

      {/* Conversation list */}
      <div className="px-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Tap + to start a conversation with a friend</p>
            <button onClick={openCompose} className="text-sm text-primary hover:underline">
              New Message
            </button>
          </div>
        ) : (
          conversations.map(convo => (
            <div key={convo.id} className="flex items-center gap-2">
              {/* Delete button in edit mode */}
              {editMode && (
                <button
                  onClick={() => deleteThread(convo.id)}
                  disabled={deleting === convo.id}
                  className="shrink-0 h-8 w-8 rounded-full bg-destructive/90 flex items-center justify-center hover:bg-destructive transition-colors"
                >
                  {deleting === convo.id
                    ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5 text-white" />
                  }
                </button>
              )}

              <button
                onClick={() => !editMode && navigate(`/messages/${convo.id}`)}
                className="flex-1 cosmic-card rounded-xl p-4 flex items-center gap-3 text-left hover:border-primary/20 transition-all"
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {convo.is_group ? (
                    <Users className="h-5 w-5 text-primary" />
                  ) : convo.other_avatar_url ? (
                    <img src={convo.other_avatar_url} className="h-10 w-10 object-cover" alt="" />
                  ) : (
                    <span className="text-primary font-bold text-sm">
                      {displayName(convo)[0]?.toUpperCase() || "?"}
                    </span>
                  )}
                </div>

                {/* Name + last message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium truncate ${convo.has_unread ? "text-foreground font-semibold" : ""}`}>
                      {displayName(convo)}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatTime(convo.last_message_at)}
                    </span>
                  </div>
                  {convo.last_message && (
                    <p className={`text-xs truncate ${convo.has_unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {convo.last_message}
                    </p>
                  )}
                </div>

                {convo.has_unread && !editMode && (
                  <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                )}
              </button>
            </div>
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
                  {friends.length === 0
                    ? "No friends yet — add some from the Friends page"
                    : "No matches"}
                </p>
              ) : (
                filteredFriends.map(f => (
                  <button
                    key={f.user_id}
                    onClick={() => startConversation(f.user_id)}
                    disabled={!!startingWith}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} className="h-9 w-9 object-cover" alt="" />
                      ) : (
                        <span className="text-primary font-bold text-sm">
                          {(f.display_name || f.username || "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium">{f.display_name || f.username}</p>
                      {f.username && <p className="text-xs text-muted-foreground">@{f.username}</p>}
                    </div>
                    {startingWith === f.user_id && (
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full shrink-0" />
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
