import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatMember {
  user_id: string;
  display_name: string;
  avatar_url: string;
}

const LONG_PRESS_MS = 500;

const ChatPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatName, setChatName] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [deletingMsg, setDeletingMsg] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !conversationId) return;
    loadChat();
    scheduleMarkRead();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          scheduleMarkRead();
          // Invalidate conversation list so it shows latest message + clears unread badge
          if (user) {
            qc.invalidateQueries({ queryKey: ["conversations", user.id] });
            qc.invalidateQueries({ queryKey: ["unread-messages", user.id] });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[ChatPage] Realtime subscription issue:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
  }, [user, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Debounce markRead so we don't spam DB on rapid message arrival */
  const scheduleMarkRead = useCallback(() => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(async () => {
      if (!user || !conversationId) return;
      await supabase
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (user) qc.invalidateQueries({ queryKey: ["unread-messages", user.id] });
    }, 800);
  }, [user?.id, conversationId]);

  const loadChat = async () => {
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
      const otherIds = memberRows.map((m: any) => m.user_id).filter((id: string) => id !== user.id);
      const { data: profiles } = await (supabase as any)
        .rpc("get_public_profiles", { user_ids: otherIds });
      setMembers((profiles as ChatMember[]) || []);

      if (convo?.is_group) {
        setChatName(convo.name || "Group Chat");
      } else if (profiles?.length > 0) {
        setChatName((profiles[0] as any).display_name || (profiles[0] as any).username || "Chat");
      }
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200) as any;

    setMessages(msgs || []);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      } as any);

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", conversationId);

      if (user) qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    } catch {
      setNewMessage(content);
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  /* ── Long-press to select own message ── */
  const handlePressStart = (msgId: string, isMe: boolean) => {
    if (!isMe) return;
    pressTimerRef.current = setTimeout(() => setSelectedMsg(msgId), LONG_PRESS_MS);
  };
  const handlePressEnd = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  };

  const deleteMessage = async (msgId: string) => {
    setDeletingMsg(msgId);
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", msgId) as any;

    if (error) {
      toast({ title: "Couldn't delete message", variant: "destructive" });
    } else {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    }
    setSelectedMsg(null);
    setDeletingMsg(null);
  };

  const getMemberName = (senderId: string) => {
    if (senderId === user?.id) return "You";
    return members.find(m => m.user_id === senderId)?.display_name || "User";
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-col h-screen" onClick={() => selectedMsg && setSelectedMsg(null)}>
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/messages")} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {members.length === 1 && members[0].avatar_url ? (
              <img src={members[0].avatar_url} className="h-8 w-8 rounded-full object-cover shrink-0" alt="" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold text-xs">{chatName[0]?.toUpperCase()}</span>
              </div>
            )}
            <h1 className="text-lg font-bold font-display truncate">{chatName}</h1>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map(msg => {
          const isMe = msg.sender_id === user?.id;
          const isSelected = selectedMsg === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"} items-end gap-2`}
            >
              {/* Delete action (own messages, when selected) */}
              {isMe && isSelected && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                  disabled={deletingMsg === msg.id}
                  className="shrink-0 h-8 w-8 rounded-full bg-destructive/90 flex items-center justify-center hover:bg-destructive transition-colors mb-1"
                >
                  {deletingMsg === msg.id
                    ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5 text-white" />
                  }
                </button>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 select-none cursor-default transition-opacity ${
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary text-foreground rounded-bl-md"
                } ${isSelected ? "opacity-70 ring-2 ring-destructive/50" : ""}`}
                onMouseDown={() => handlePressStart(msg.id, isMe)}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={() => handlePressStart(msg.id, isMe)}
                onTouchEnd={handlePressEnd}
                onTouchCancel={handlePressEnd}
              >
                {members.length > 1 && !isMe && (
                  <p className="text-[10px] font-medium opacity-70 mb-0.5">{getMemberName(msg.sender_id)}</p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0 pb-safe">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            onClick={() => setSelectedMsg(null)}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 rounded-full bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {selectedMsg && (
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            Hold message to delete • tap elsewhere to dismiss
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatPage;
