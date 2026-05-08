import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  pending?: boolean;
}

interface ChatMember {
  user_id: string;
  display_name: string;
  avatar_url: string;
  username: string;
}

const ChatPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatName, setChatName] = useState("");
  const [chatAvatar, setChatAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef(new Set<string>());

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  const markRead = useCallback(async () => {
    if (!user || !conversationId) return;
    await supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
  }, [user, conversationId]);

  const loadChat = useCallback(async () => {
    if (!conversationId || !user) return;

    const { data: convo } = await supabase
      .from("conversations")
      .select("name, is_group")
      .eq("id", conversationId)
      .single() as any;

    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId) as any;

    if (memberRows) {
      const otherIds = (memberRows as any[]).map(m => m.user_id).filter((id: string) => id !== user.id);
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { user_ids: otherIds }) as any;

      const profileList = (profiles as ChatMember[]) || [];
      setMembers(profileList);

      if (convo?.is_group) {
        setChatName(convo.name || "Group Chat");
      } else if (profileList.length > 0) {
        const other = profileList[0];
        setChatName(other.display_name || other.username || "Chat");
        setChatAvatar(other.avatar_url || null);
      }
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200) as any;

    const loaded = (msgs || []) as Message[];
    loaded.forEach(m => seenIds.current.add(m.id));
    setMessages(loaded);
    setLoading(false);
    setTimeout(() => scrollToBottom(false), 50);
  }, [conversationId, user, scrollToBottom]);

  useEffect(() => {
    if (!user || !conversationId) return;
    loadChat();
    markRead();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          // Skip messages we already have (our own optimistic inserts)
          if (seenIds.current.has(incoming.id)) return;
          seenIds.current.add(incoming.id);
          setMessages(prev => {
            // Replace any pending optimistic message with the same content from this sender
            const withoutPending = prev.filter(
              m => !(m.pending && m.sender_id === incoming.sender_id && m.content === incoming.content)
            );
            return [...withoutPending, incoming];
          });
          markRead();
          scrollToBottom();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, conversationId, loadChat, markRead, scrollToBottom]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  const sendMessage = async () => {
    const content = newMessage.trim();
    if (!content || !user || !conversationId || sending) return;
    setSending(true);
    setNewMessage("");

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom();

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: user.id, content } as any)
      .select("id, sender_id, content, created_at")
      .single() as any;

    if (error) {
      // Revert optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setNewMessage(content);
    } else if (inserted) {
      seenIds.current.add(inserted.id);
      // Replace optimistic with real message
      setMessages(prev => prev.map(m => m.id === tempId ? { ...inserted } : m));
      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", conversationId);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const getMemberName = (senderId: string) => {
    if (senderId === user?.id) return "You";
    const m = members.find(m => m.user_id === senderId);
    return m?.display_name || m?.username || "User";
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const formatDateSeparator = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Group messages by date for separators
  let lastDateStr = "";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border/50 bg-background/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/messages")} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-9 w-9 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
            {chatAvatar ? (
              <img src={chatAvatar} className="h-9 w-9 object-cover" alt="" />
            ) : (
              <span className="text-primary font-bold text-sm">{chatName[0]?.toUpperCase() ?? "?"}</span>
            )}
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">{chatName || "Loading…"}</h1>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Say hi! 👋</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === user?.id;
            const dateStr = formatDateSeparator(msg.created_at);
            const showDate = dateStr !== lastDateStr;
            if (showDate) lastDateStr = dateStr;

            // Collapse consecutive messages from same sender
            const prevMsg = messages[i - 1];
            const nextMsg = messages[i + 1];
            const isSameAsPrev = prevMsg && prevMsg.sender_id === msg.sender_id && !showDate;
            const isSameAsNext = nextMsg && nextMsg.sender_id === msg.sender_id;
            const showAvatar = !isMe && !isSameAsNext;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                      {dateStr}
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                )}
                <div className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"} ${isSameAsPrev ? "mt-0.5" : "mt-2"}`}>
                  {/* Other user avatar placeholder for alignment */}
                  {!isMe && (
                    <div className="w-6 h-6 shrink-0">
                      {showAvatar && (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-primary">
                            {getMemberName(msg.sender_id)[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`max-w-[72%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!isMe && !isSameAsPrev && members.length > 1 && (
                      <span className="text-[10px] text-muted-foreground/60 ml-1 font-medium">
                        {getMemberName(msg.sender_id)}
                      </span>
                    )}
                    <div className={`
                      rounded-2xl px-3.5 py-2.5 shadow-sm
                      ${isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-foreground rounded-bl-sm"
                      }
                      ${msg.pending ? "opacity-60" : ""}
                    `}>
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                    {(!isSameAsNext || msg.pending) && (
                      <span className={`text-[9px] tabular-nums text-muted-foreground/50 ${isMe ? "text-right" : "text-left"} px-1`}>
                        {msg.pending ? "Sending…" : formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border/50 bg-background/95 backdrop-blur-sm shrink-0 pb-safe">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message…"
            className="flex-1 px-4 py-2.5 rounded-full bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            autoComplete="off"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
