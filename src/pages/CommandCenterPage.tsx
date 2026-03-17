import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAstraMode, type AstraMode } from "@/hooks/use-astra-mode";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Sparkles, Crosshair, Shield, Eye, Moon,
  Activity, Target, AlertTriangle, Clock, Heart, Zap,
  Send, ArrowRight, Loader2, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import AstraVerdictCard, { type AstraVerdict } from "@/components/astra/AstraVerdictCard";
import AstraAssessmentHistory from "@/components/astra/AstraAssessmentHistory";
import { useBettingProfile, ARCHETYPE_META } from "@/hooks/use-betting-profile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { profile } = useBettingProfile();
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<AstraVerdict | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const askAstra = async () => {
    const text = query.trim();
    if (!text || isAsking) return;
    setIsAsking(true);
    setVerdict(null);
    try {
      const { data, error } = await supabase.functions.invoke("astra-decision-engine", {
        body: { question: text, mode: activeMode },
      });
      if (error) throw error;
      if (data?.assessment) setVerdict(data.assessment as AstraVerdict);
    } catch (e) {
      console.error("Astra error:", e);
    } finally {
      setIsAsking(false);
    }
  };

  // Live opportunities from astra_opportunity_feed
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

  // Live slip health from bet_slips + bet_slip_picks
  const { data: slipHealth } = useQuery({
    queryKey: ["cc-slip-health", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: slips } = await supabase
        .from("bet_slips")
        .select("id, status, result, stake, payout, entry_type")
        .eq("user_id", user.id)
        .in("status", ["active", "pending", "live"])
        .limit(20);

      const { data: picks } = await supabase
        .from("bet_slip_picks")
        .select("slip_id, result, match_status, live_value, line, progress")
        .in("slip_id", (slips || []).map(s => s.id))
        .limit(100);

      const activeSlips = slips || [];
      const allPicks = picks || [];
      const totalLegs = allPicks.length;
      const hitLegs = allPicks.filter(p => p.result === "hit" || p.result === "win").length;
      const dangerLegs = allPicks.filter(p => {
        if (!p.live_value || !p.line) return false;
        return Number(p.progress || 0) < 40;
      }).length;

      return {
        activeCount: activeSlips.length,
        totalLegs,
        hitLegs,
        dangerLegs,
        weakestSlip: dangerLegs > 0 ? "Has struggling legs" : null,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Recent Astra assessments for trap detection
  const { data: recentTraps } = useQuery({
    queryKey: ["cc-trap-watch", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("astra_bet_assessment")
        .select("id, decision_label, player_id, market_type, trap_score, warning_note, created_at")
        .eq("user_id", user.id)
        .in("decision_label", ["pass", "trap_watch"])
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Live games count for pulse
  const { data: liveGamesCount } = useQuery({
    queryKey: ["cc-live-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .in("status", ["live", "in_progress"]);
      return count || 0;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
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
          onKeyDown={(e) => e.key === "Enter" && askAstra()}
          placeholder="Ask Astra a betting question…"
          className="w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={askAstra}
          disabled={isAsking || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Live Verdict */}
      {verdict && <AstraVerdictCard verdict={verdict} />}

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

      {/* Dashboard Grid — LIVE COMPUTED STATE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Astra Pulse — live computed */}
        <DashCard title="Astra Pulse" icon={Activity}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                "h-2 w-2 rounded-full",
                (liveGamesCount ?? 0) > 0 ? "bg-cosmic-green animate-pulse" : "bg-muted-foreground"
              )} />
              <span className="text-[11px] text-foreground font-semibold">
                {(liveGamesCount ?? 0) > 0
                  ? `${liveGamesCount} live game${liveGamesCount !== 1 ? "s" : ""} · Scanning`
                  : "No live games — pregame analysis mode"
                }
              </span>
            </div>
            {profile && (
              <p className="text-[10px] text-muted-foreground">
                {ARCHETYPE_META[profile.betting_archetype]?.emoji}{" "}
                {ARCHETYPE_META[profile.betting_archetype]?.label || profile.betting_archetype}
                {" · "}{activeModeConfig?.mode_name || activeMode} mode
              </p>
            )}
            {filteredOpps.length > 0 && (
              <p className="text-[10px] text-cosmic-green font-semibold">
                {filteredOpps.length} opportunit{filteredOpps.length === 1 ? "y" : "ies"} detected
              </p>
            )}
          </div>
        </DashCard>

        {/* Best Opportunities — live from feed */}
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

        {/* Trap Watch — live from assessments */}
        <DashCard title="Trap Watch" icon={AlertTriangle}>
          {(recentTraps?.length ?? 0) === 0 ? (
            <p className="text-[11px] text-muted-foreground">No active trap alerts.</p>
          ) : (
            <div className="space-y-1">
              {recentTraps!.slice(0, 3).map((t: any) => (
                <div key={t.id} className="text-[10px]">
                  <span className="text-cosmic-red font-semibold">⚠</span>{" "}
                  <span className="text-foreground">{t.warning_note || t.market_type || "Trap detected"}</span>
                  {t.trap_score != null && (
                    <span className="text-muted-foreground ml-1">({Math.round(t.trap_score * 100)}%)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        {/* Cosmic Windows */}
        <DashCard title="Cosmic Windows" icon={Moon} dimmed={activeMode === "sharp"}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "sharp"
              ? "Cosmic layer de-emphasized in Sharp mode."
              : activeMode === "ritual"
              ? "Full cosmic window analysis active."
              : "Planetary hour and transit windows loading…"}
          </p>
        </DashCard>

        {/* Slip Health — live computed */}
        <DashCard title="Slip Health" icon={Heart}>
          {!slipHealth || slipHealth.activeCount === 0 ? (
            <p className="text-[11px] text-muted-foreground">No active slips to monitor.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-foreground font-semibold">
                  {slipHealth.activeCount} active slip{slipHealth.activeCount !== 1 ? "s" : ""}
                </span>
                <span className="text-muted-foreground">
                  {slipHealth.totalLegs} legs
                </span>
              </div>
              {slipHealth.hitLegs > 0 && (
                <p className="text-[10px] text-cosmic-green font-semibold">
                  ✓ {slipHealth.hitLegs} leg{slipHealth.hitLegs !== 1 ? "s" : ""} hit
                </p>
              )}
              {slipHealth.dangerLegs > 0 && (
                <p className="text-[10px] text-cosmic-red font-semibold">
                  ⚠ {slipHealth.dangerLegs} leg{slipHealth.dangerLegs !== 1 ? "s" : ""} struggling
                </p>
              )}
            </div>
          )}
        </DashCard>

        {/* Opportunity Feed — live */}
        <DashCard title="Opportunity Feed" icon={Zap}>
          {filteredOpps.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Feed empty. Waiting for model outputs…</p>
          ) : (
            <div className="space-y-1">
              {filteredOpps.slice(0, 5).map((o: any) => (
                <div key={o.id} className="text-[10px] text-muted-foreground truncate">{o.headline}</div>
              ))}
            </div>
          )}
        </DashCard>
      </div>

      {/* Assessment History */}
      <AstraAssessmentHistory limit={5} />
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
