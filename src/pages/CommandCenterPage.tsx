import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAstraMode, type AstraMode } from "@/hooks/use-astra-mode";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Sparkles, Crosshair, Shield, Eye, Moon,
  Activity, Target, AlertTriangle, Clock, Heart, Zap,
  Send, ArrowRight, Loader2,
} from "lucide-react";
import AstraVerdictCard, { type AstraVerdict } from "@/components/astra/AstraVerdictCard";
import AstraAssessmentHistory from "@/components/astra/AstraAssessmentHistory";

const MODE_ICONS: Record<string, any> = {
  TrendingUp, Sparkles, Crosshair, Shield, Eye, Moon,
};

const QUICK_CHIPS = [
  { label: "Good bet or pass", icon: Target },
  { label: "Best live spot", icon: Zap },
  { label: "Safest angle", icon: Shield },
  { label: "Trap watch", icon: AlertTriangle },
  { label: "Compare", icon: ArrowRight },
  { label: "Hedge this", icon: Heart },
];

export default function CommandCenterPage() {
  const { user } = useAuth();
  const { modes, activeMode, activeModeConfig, setMode } = useAstraMode();
  const [query, setQuery] = useState("");

  const { data: opportunities } = useQuery({
    queryKey: ["astra-opportunities", activeMode],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("astra_opportunity_feed")
        .select("*")
        .eq("is_active", true)
        .order("confidence", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const filteredOpps = useMemo(() => {
    if (!opportunities) return [];
    return opportunities.filter((o: any) =>
      !o.mode_relevance?.length || o.mode_relevance.includes(activeMode)
    );
  }, [opportunities, activeMode]);

  return (
    <div className="min-h-screen pb-24 space-y-6 px-4 pt-4 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Command Center</h1>
        <p className="text-xs text-muted-foreground tracking-wide uppercase">Astra Ritual Intelligence</p>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
        {modes.map((m) => {
          const Icon = MODE_ICONS[m.icon_name] || Sparkles;
          const isActive = m.mode_key === activeMode;
          return (
            <button
              key={m.mode_key}
              onClick={() => setMode(m.mode_key as AstraMode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border",
                isActive
                  ? "bg-primary/15 text-primary border-primary/30 shadow-sm"
                  : "bg-card/50 text-muted-foreground border-border/30 hover:bg-card hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {m.mode_name}
            </button>
          );
        })}
      </div>

      {activeModeConfig && (
        <p className="text-[11px] text-muted-foreground/70 italic">{activeModeConfig.description}</p>
      )}

      {/* Ask Astra */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask Astra anything…"
          className="w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => setQuery(chip.label)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-card/50 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-card transition-all"
          >
            <chip.icon className="w-3 h-3" />
            {chip.label}
          </button>
        ))}
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DashCard title="Astra Pulse" icon={Activity}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "sharp" && "Quant signals active. Market edges scanning."}
            {activeMode === "cosmic" && "Balanced cosmic + quant intelligence online."}
            {activeMode === "sniper" && "Scanning for hidden live value…"}
            {activeMode === "hedge" && "Risk radar active. Monitoring exposure."}
            {activeMode === "shadow" && "Trap detection running. Watching for weakness."}
            {activeMode === "ritual" && "Cosmic windows open. Archetypes aligned."}
          </p>
        </DashCard>

        <DashCard title="Best Opportunities" icon={Target}>
          {filteredOpps.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No active opportunities right now.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredOpps.slice(0, 3).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground truncate flex-1">{o.headline}</span>
                  {o.confidence != null && (
                    <span className="text-primary font-bold tabular-nums ml-2">
                      {(o.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        <DashCard title="Trap Watch" icon={AlertTriangle}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "shadow"
              ? "Shadow mode: elevated trap sensitivity active."
              : "Monitoring for trap lines and weakening support…"}
          </p>
        </DashCard>

        <DashCard title="Cosmic Windows" icon={Moon} dimmed={activeMode === "sharp"}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "sharp"
              ? "Cosmic layer de-emphasized in Sharp mode."
              : activeMode === "ritual"
              ? "Full cosmic window analysis active."
              : "Planetary hour and transit windows loading…"}
          </p>
        </DashCard>

        <DashCard title="Slip Health" icon={Heart}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "hedge"
              ? "Hedge mode: prioritizing slip risk analysis."
              : "Active slip health monitoring…"}
          </p>
        </DashCard>

        <DashCard title="Opportunity Feed" icon={Zap}>
          {filteredOpps.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Feed empty. Games loading…</p>
          ) : (
            <div className="space-y-1">
              {filteredOpps.slice(0, 5).map((o: any) => (
                <div key={o.id} className="text-[10px] text-muted-foreground truncate">{o.headline}</div>
              ))}
            </div>
          )}
        </DashCard>
      </div>
    </div>
  );
}

function DashCard({ title, icon: Icon, dimmed, children }: {
  title: string;
  icon: any;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm p-4 space-y-2 transition-opacity",
      dimmed && "opacity-50"
    )}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
