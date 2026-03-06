import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Sparkles, Info, BookOpen, FlaskConical, Compass, Send, Loader2, ChevronRight, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import AstraStructuredResponse, { type AstraResponse, type CosmicEdgeResponse } from "@/components/astra/AstraStructuredResponse";
import AstraAboutTab from "@/components/astra/AstraAboutTab";
import AstraGlossaryTab from "@/components/astra/AstraGlossaryTab";
import AstraFormulasEnginesTab from "@/components/astra/AstraFormulasEnginesTab";
import AstraMethodologyTab from "@/components/astra/AstraMethodologyTab";
import { useIsAdmin } from "@/hooks/use-admin";

const MachinaSection = lazy(() => import("@/components/astra/MachinaSection"));

type Msg = { role: "user" | "assistant"; content: string; structured?: AstraResponse | CosmicEdgeResponse };

/* ── AI Chat (inline) ── */
function AstraChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;
    if (!overrideText) setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("astro-interpret", {
        body: { mode: "freeform", delivery_mode: "chat", custom_prompt: text },
      });
      if (error) throw error;

      if (data?.cosmic_edge) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.cosmic_edge.astro?.answer?.narrative || "",
          structured: data.cosmic_edge as CosmicEdgeResponse,
        }]);
      } else if (data?.structured) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.structured.answer?.narrative || "",
          structured: data.structured as AstraResponse,
        }]);
      } else {
        const reply = data?.interpretation || "I couldn't generate a response. Please try again.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
    } catch (e) {
      console.error("Chat error:", e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error connecting to the astrology engine. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "How efficient have the Celtics been lately?",
    "Compare LeBron's PER and usage vs the Knicks",
    "What does Mars in Leo mean for athletic performance?",
    "Break down the Lakers vs Warriors matchup — stats and astro",
  ];

  return (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <div className="text-center">
              <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">Ask CosmicEdge AI</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Powered by traditional + modern astrology engines
              </p>
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="w-full text-left cosmic-card rounded-lg p-3 flex items-center gap-2 hover:border-primary/30 transition-colors"
                >
                  <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <div className="rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] ml-auto bg-primary text-primary-foreground">
                {m.content}
              </div>
            ) : m.structured ? (
              <AstraStructuredResponse data={m.structured} onFollowUpClick={(q) => send(q)} />
            ) : (
              <div className="cosmic-card rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] text-foreground">
                {m.content.split("\n").map((line, j) => {
                  const escaped = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                  return (
                    <p key={j} className={j > 0 ? "mt-1" : ""} dangerouslySetInnerHTML={{
                      __html: escaped
                        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-primary">$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    }} />
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[10px]">Consulting the stars...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about stats, matchups, astrology..."
          className="flex-1 bg-secondary rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={() => send()}
          disabled={isLoading || !input.trim()}
          className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Tabs config ── */
const PUBLIC_TABS = [
  { key: "chat", label: "AI Chat", icon: Sparkles },
  { key: "about", label: "About CosmicEdge", icon: Info },
  { key: "glossary", label: "Cosmic Lexicon", icon: BookOpen },
  { key: "engines", label: "Celestial Engines", icon: FlaskConical },
  { key: "methodology", label: "Behind the Stars", icon: Compass },
] as const;

const ADMIN_TAB = { key: "machina" as const, label: "Machina", icon: Cpu };

type TabKey = typeof PUBLIC_TABS[number]["key"] | "machina";

export default function AstraPage() {
  const [tab, setTab] = useState<TabKey>("chat");
  const { isAdmin } = useIsAdmin();

  const allTabs = isAdmin ? [...PUBLIC_TABS, ADMIN_TAB] : [...PUBLIC_TABS];

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display text-foreground">Astra AI</h1>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          AI-powered astrology insights, model documentation & technical reference
        </p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {allTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-semibold transition-colors border whitespace-nowrap",
                tab === t.key
                  ? t.key === "machina"
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        {tab === "chat" && <AstraChat />}
        {tab === "about" && <AstraAboutTab />}
        {tab === "glossary" && <AstraGlossaryTab />}
        {tab === "engines" && <AstraFormulasEnginesTab />}
        {tab === "methodology" && <AstraMethodologyTab />}
        {tab === "machina" && isAdmin && (
          <Suspense fallback={<div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>}>
            <MachinaSection />
          </Suspense>
        )}
      </div>
    </div>
  );
}
