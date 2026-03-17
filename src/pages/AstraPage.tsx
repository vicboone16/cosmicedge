import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Sparkles, Info, BookOpen, FlaskConical, Compass, Send, Loader2, ChevronRight, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { GuidanceCard } from "@/components/ui/GuidanceCard";
import { supabase } from "@/integrations/supabase/client";
import AstraStructuredResponse, { type AstraResponse, type CosmicEdgeResponse } from "@/components/astra/AstraStructuredResponse";
import AstraAboutTab from "@/components/astra/AstraAboutTab";
import AstraGlossaryTab from "@/components/astra/AstraGlossaryTab";
import AstraFormulasEnginesTab from "@/components/astra/AstraFormulasEnginesTab";
import AstraMethodologyTab from "@/components/astra/AstraMethodologyTab";
import { useIsAdmin } from "@/hooks/use-admin";
import { useCustomModels } from "@/hooks/use-custom-models";
import { detectModelIntent, resolvePlayer, findModelByName, formatPredictionForChat } from "@/lib/astra-model-router";
import { fetchPlayerFactors, executeModel, STAT_KEYS } from "@/lib/model-engine";
import { FACTOR_LIBRARY } from "@/lib/model-factors";
import AstraComputeFailureCardUI from "@/components/astra/AstraComputeFailureCard";
import type { ComputeFailureCard } from "@/lib/compute-gating";

const MachinaSection = lazy(() => import("@/components/astra/MachinaSection"));

type Msg = {
  role: "user" | "assistant";
  content: string;
  structured?: AstraResponse | CosmicEdgeResponse;
  computeFailure?: ComputeFailureCard;
};

/* ── AI Chat (inline) ── */
function AstraChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: customModels } = useCustomModels();

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
      // ── Step 0: Check for model intent ──
      const intent = detectModelIntent(text);

      if (intent?.type === "run_model" && intent.playerName) {
        const player = await resolvePlayer(intent.playerName);
        if (player) {
          // Find model
          const model = intent.modelName && customModels
            ? findModelByName(intent.modelName, customModels)
            : null;

          const factors = model
            ? (model.factors as any)
            : FACTOR_LIBRARY.map((f) => ({ key: f.key, weight: f.defaultWeight, enabled: f.category === "base" || f.category === "environment" }));

          const statKey = intent.statKey ?? "points";
          const values = await fetchPlayerFactors(player.id, statKey);
          const line = values.season_avg ?? 20;

          const result = executeModel(factors, values, line, model?.name ?? "CosmicEdge Default", model?.id);
          const formatted = formatPredictionForChat(result);

          setMessages((prev) => [...prev, { role: "assistant", content: formatted }]);
          setIsLoading(false);
          return;
        }
      }

      if (intent?.type === "backtest_query") {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "📊 Head to the **Model Workspace → Backtest** tab to run a full backtest with your saved models. You can select sport, stat, model, and date range there.",
        }]);
        setIsLoading(false);
        return;
      }

      // ── Step 1: Try decision engine ──
      const { data: decisionData, error: decisionError } = await supabase.functions.invoke("astra-decision-engine", {
        body: { question: text },
      });

      // Handle compute-blocked responses with structured failure card
      if (!decisionError && decisionData?.compute_blocked) {
        const failureCard: ComputeFailureCard = {
          type: "compute_failure",
          query_target: text,
          resolved_player: null,
          resolved_game: null,
          active_model: null,
          missing_variables: [],
          invalid_variables: decisionData.sanity_violations ?? [],
          grain_mismatches: [],
          compute_blocked_reason: decisionData.block_reason || "Compute pipeline blocked",
          stages: (decisionData.pipeline ?? []).map((s: any) => ({
            step: s.step,
            status: s.status,
            detail: s.detail,
          })),
        };
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: decisionData.block_reason || "Compute blocked",
          computeFailure: failureCard,
        }]);
        setIsLoading(false);
        return;
      }

      // Handle successful decision engine response
      if (!decisionError && decisionData?.success && decisionData?.assessment?.answer_summary) {
        const a = decisionData.assessment;
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: a.answer_summary,
          structured: undefined,
        }]);
        setIsLoading(false);
        return;
      }

      // ── Step 2: Try compute pipeline ──
      const { data: computeData, error: computeError } = await supabase.functions.invoke("astra-compute", {
        body: { question: text },
      });

      if (!computeError && computeData?.success && computeData?.answer) {
        let content = computeData.answer;
        if (computeData.computed_value != null) {
          content = `**${computeData.computed_value}**\n\n${content}`;
        }
        if (computeData.formula_used) {
          content += `\n\n*Formula: ${computeData.formula_used.name}*`;
          if (computeData.formula_used.text) {
            content += `\n\`${computeData.formula_used.text}\``;
          }
        }
        if (computeData.fallback_info?.length) {
          content += `\n\n⚠️ ${computeData.fallback_info.join(" · ")}`;
        }
        setMessages((prev) => [...prev, { role: "assistant", content }]);
      } else {
        // ── Step 3: Fallback to astro-interpret ──
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
    "Run my prop model on Jalen Brunson points",
    "Predict LeBron rebounds using CosmicEdge Default",
    "How efficient have the Celtics been lately?",
    "What does Mars in Leo mean for athletic performance?",
    "Compare LeBron's PER and usage vs the Knicks",
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
            ) : m.computeFailure ? (
              <AstraComputeFailureCardUI failure={m.computeFailure} />
            ) : m.structured ? (
              <AstraStructuredResponse data={m.structured} onFollowUpClick={(q) => send(q)} />
            ) : (
              <div className="cosmic-card rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] text-foreground">
                {m.content.split("\n").map((line, j) => {
                  const parts: React.ReactNode[] = [];
                  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
                  let lastIndex = 0;
                  let match;
                  while ((match = regex.exec(line)) !== null) {
                    if (match.index > lastIndex) {
                      parts.push(line.slice(lastIndex, match.index));
                    }
                    if (match[1]) {
                      parts.push(<strong key={`${j}-b-${match.index}`} className="font-bold text-primary">{match[1]}</strong>);
                    } else if (match[2]) {
                      parts.push(<em key={`${j}-i-${match.index}`}>{match[2]}</em>);
                    }
                    lastIndex = regex.lastIndex;
                  }
                  if (lastIndex < line.length) {
                    parts.push(line.slice(lastIndex));
                  }
                  return (
                    <p key={j} className={j > 0 ? "mt-1" : ""}>{parts.length > 0 ? parts : line}</p>
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
  const [machinaFormulaSlug, setMachinaFormulaSlug] = useState<string | null>(null);
  const { isAdmin } = useIsAdmin();

  const allTabs = isAdmin ? [...PUBLIC_TABS, ADMIN_TAB] : [...PUBLIC_TABS];

  const handleRunInMachina = (slug: string) => {
    setMachinaFormulaSlug(slug);
    setTab("machina");
  };

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
        {tab === "engines" && <AstraFormulasEnginesTab onRunInMachina={isAdmin ? handleRunInMachina : undefined} />}
        {tab === "methodology" && <AstraMethodologyTab />}
        {tab === "machina" && isAdmin && (
          <Suspense fallback={<div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>}>
            <MachinaSection initialFormulaSlug={machinaFormulaSlug} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
