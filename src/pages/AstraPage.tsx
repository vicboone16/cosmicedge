import { useState, useRef, useEffect } from "react";
import { Sparkles, BookOpen, Send, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AstraStructuredResponse, { type AstraResponse, type CosmicEdgeResponse } from "@/components/astra/AstraStructuredResponse";

type Msg = { role: "user" | "assistant"; content: string; structured?: AstraResponse | CosmicEdgeResponse };

const GLOSSARY_TYPES = [
  { key: "traditional-points", label: "Traditional Points", icon: "☉" },
  { key: "dignities", label: "Dignities", icon: "♛" },
  { key: "horary-considerations", label: "Horary Considerations", icon: "⏳" },
  { key: "horary-categories", label: "Horary Categories", icon: "🔮" },
] as const;

function GlossaryBrowser() {
  const [activeType, setActiveType] = useState<string>("traditional-points");

  const { data: glossaryData, isLoading } = useQuery({
    queryKey: ["glossary", activeType],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/astrologyapi?mode=glossary&type=${activeType}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!resp.ok) return null;
      return resp.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  // API returns { success, provider, result: { data, metadata, ... } }
  const raw = glossaryData?.result;
  const items = raw?.data?.points || raw?.data?.dignities || raw?.data?.considerations || raw?.data?.categories || raw?.data || (Array.isArray(raw) ? raw : null);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {GLOSSARY_TYPES.map((g) => (
          <button
            key={g.key}
            onClick={() => setActiveType(g.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap border transition-colors",
              activeType === g.key
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{g.icon}</span>
            {g.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {Array.isArray(items) ? (
            items.map((item: any, i: number) => (
              <div key={i} className="cosmic-card rounded-lg p-3">
                <div className="flex items-center gap-2">
                  {item.symbol && <span className="text-lg">{item.symbol}</span>}
                  <p className="text-xs font-semibold text-foreground">
                    {item.name || item.traditional_name || item.title || item.key || item.label || `Item ${i + 1}`}
                  </p>
                </div>
                {item.meaning && (
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.meaning}</p>
                )}
                {item.description && !item.meaning && (
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                )}
                {item.element && (
                  <p className="text-[9px] text-primary mt-0.5">Element: {item.element}</p>
                )}
                {item.category && (
                  <p className="text-[9px] text-muted-foreground/80 mt-0.5">{item.category}</p>
                )}
                {item.ruling_planet && (
                  <p className="text-[9px] text-primary mt-0.5">Ruler: {item.ruling_planet}</p>
                )}
                {item.keywords && Array.isArray(item.keywords) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.keywords.slice(0, 5).map((kw: string, ki: number) => (
                      <span key={ki} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{kw}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : typeof items === "object" ? (
            Object.entries(items).map(([key, val]: [string, any]) => {
              const item = typeof val === "object" && val !== null ? val : { description: String(val) };
              return (
                <div key={key} className="cosmic-card rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    {item.symbol && <span className="text-lg">{item.symbol}</span>}
                    <p className="text-xs font-semibold text-foreground">
                      {item.name || key.replace(/_/g, " ")}
                    </p>
                  </div>
                  {item.meaning && (
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.meaning}</p>
                  )}
                  {item.description && !item.meaning && (
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                  )}
                  {item.traditional_name && (
                    <p className="text-[9px] text-primary/70 mt-0.5">Traditional: {item.traditional_name}</p>
                  )}
                  {item.element && (
                    <p className="text-[9px] text-primary mt-0.5">Element: {item.element}</p>
                  )}
                  {item.category && (
                    <p className="text-[9px] text-muted-foreground/80 mt-0.5">{item.category}</p>
                  )}
                  {item.keywords && Array.isArray(item.keywords) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.keywords.slice(0, 5).map((kw: string, ki: number) => (
                        <span key={ki} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">{JSON.stringify(items)}</p>
          )}
        </div>
      )}

      {!isLoading && !items && (
        <div className="text-center py-8">
          <p className="text-xs text-muted-foreground">
            Unable to load glossary — API quota may be exceeded
          </p>
        </div>
      )}
    </div>
  );
}

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
        body: {
          mode: "freeform",
          delivery_mode: "chat",
          custom_prompt: text,
        },
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
                  onClick={() => { setInput(s); }}
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
                  // Escape HTML entities first to prevent XSS, then apply markdown formatting
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

export default function AstraPage() {
  const [tab, setTab] = useState<"chat" | "glossary">("chat");

  return (
    <div className="min-h-screen">
      <header className="px-4 pt-12 pb-4 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display text-foreground">Astra & AI</h1>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          AI-powered astrology insights and technical glossary
        </p>
        <div className="flex gap-2">
          {([
            { val: "chat" as const, icon: Sparkles, label: "AI Chat" },
            { val: "glossary" as const, icon: BookOpen, label: "Glossary" },
          ]).map((t) => (
            <button
              key={t.val}
              onClick={() => setTab(t.val)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors border",
                tab === t.val
                  ? "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        {tab === "chat" && <AstraChat />}
        {tab === "glossary" && <GlossaryBrowser />}
      </div>
    </div>
  );
}
