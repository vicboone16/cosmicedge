import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  bet_id: string | null;
  created_at: string;
}

interface ChatMember {
  user_id: string;
  display_name: string;
  avatar_url: string;
}

const ChatPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatName, setChatName] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !conversationId) return;
    loadChat();
    markRead();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          markRead();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadChat = async () => {
    if (!conversationId || !user) return;

    // Get conversation info
    const { data: convo } = await supabase
      .from("conversations")
      .select("name, is_group")
      .eq("id", conversationId)
      .single() as any;

    // Get members
    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId) as any;

    if (memberRows) {
      const userIds = memberRows.map((m: any) => m.user_id).filter((id: string) => id !== user.id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      setMembers((profiles as any[]) || []);
      
      if (convo?.is_group) {
        setChatName(convo.name || "Group Chat");
      } else if (profiles && profiles.length > 0) {
        setChatName(profiles[0].display_name || "Chat");
      }
    }

    // Get messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200) as any;

    setMessages(msgs || []);
  };

  const markRead = async () => {
    if (!user || !conversationId) return;
    await supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !conversationId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
    } as any);

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("id", conversationId);

    setSending(false);
  };

  const getMemberName = (senderId: string) => {
    if (senderId === user?.id) return "You";
    const m = members.find(m => m.user_id === senderId);
    return m?.display_name || "User";
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/messages")} className="p-1">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            {members.length === 1 && members[0].avatar_url ? (
              <img src={members[0].avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-xs">{chatName[0]?.toUpperCase()}</span>
              </div>
            )}
            <h1 className="text-lg font-bold font-display">{chatName}</h1>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map(msg => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"}`}>
                {members.length > 1 && !isMe && (
                  <p className="text-[10px] font-medium opacity-70 mb-0.5">{getMemberName(msg.sender_id)}</p>
                )}
                <p className="text-sm">{msg.content}</p>
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
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-full bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
