import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAstraMode, type AstraMode } from "@/hooks/use-astra-mode";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Sparkles, Crosshair, Shield, Eye, Moon,
  Activity, Target, AlertTriangle, Heart, Zap,
  Send, ArrowRight, Loader2, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import AstraVerdictCard, { type AstraVerdict } from "@/components/astra/AstraVerdictCard";
import AstraAssessmentHistory from "@/components/astra/AstraAssessmentHistory";
import { useBettingProfile, ARCHETYPE_META, computeFitScore } from "@/hooks/use-betting-profile";
import { BettingProfileCard, FitScoreBadge } from "@/components/profile/BettingProfileCard";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_ICONS: Record<string, any> = { TrendingUp, Sparkles, Crosshair, Shield, Eye, Moon };

const MODE_IMPORTANCE: Record<string, string> = {
  sharp: "Pure data-driven analysis. Strips cosmic layers to focus on EV, hit probability, and statistical edges. Best for bettors who want clean quant signals only.",
  cosmic: "Balanced blend of statistical + astrological factors. Uses planetary transits and cosmic windows alongside projections. The default all-rounder mode.",
  sniper: "Targets hidden value and live entry windows. Prioritizes opportunity score, timing quality, and undervalued lines that the market hasn't corrected yet.",
  hedge: "Risk-first mindset. Emphasizes correlation risk, trap detection, and safety margins. Ideal when protecting bankroll or building conservative parlays.",
  shadow: "Contrarian mode. Looks for market overreactions, public bias fades, and shadow value where the crowd is wrong. High conviction, lower volume.",
  ritual: "Full cosmic immersion. Maximizes astrological weight — planetary hours, election windows, and natal chart alignment. For users who believe in the stars.",
};

const QUICK_CHIPS = [
  { label: "Good bet or pass", icon: Target },
  { label: "Best live spot", icon: Zap },
  { label: "Safest angle", icon: Shield },
  { label: "Trap watch", icon: AlertTriangle },
  { label: "Compare", icon: ArrowRight },
  { label: "Hedge this", icon: Heart },
];

export default function CommandCenterTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { modes, activeMode, activeModeConfig, setMode } = useAstraMode();
  const { profile } = useBettingProfile();
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<AstraVerdict | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [expandedMode, setExpandedMode] = useState(false);

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

  // Live opportunities
  const { data: opportunities } = useQuery({
    queryKey: ["astra-opportunities", activeMode],
    queryFn: async () => {
      const { data } = await (supabase as any).from("astra_opportunity_feed").select("*").eq("is_active", true).order("confidence", { ascending: false }).limit(20);
      return data || [];
    },
  });

  // Live slip health
  const { data: slipHealth } = useQuery({
    queryKey: ["cc-slip-health", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: slips } = await supabase.from("bet_slips").select("id, status, result, stake, payout, entry_type").eq("user_id", user.id).in("status", ["active", "pending", "live"]).limit(20);
      const slipIds = (slips || []).map(s => s.id);
      if (!slipIds.length) return { activeCount: 0, totalLegs: 0, hitLegs: 0, dangerLegs: 0, weakestSlip: null };
      const { data: picks } = await supabase.from("bet_slip_picks").select("slip_id, result, match_status, live_value, line, progress").in("slip_id", slipIds).limit(100);
      const allPicks = picks || [];
      return {
        activeCount: slipIds.length,
        totalLegs: allPicks.length,
        hitLegs: allPicks.filter(p => p.result === "hit" || p.result === "win").length,
        dangerLegs: allPicks.filter(p => Number(p.progress || 0) < 40 && p.live_value && p.line).length,
        weakestSlip: null,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Trap watch
  const { data: recentTraps } = useQuery({
    queryKey: ["cc-trap-watch", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("astra_bet_assessment").select("id, decision_label, market_type, trap_score, warning_note, created_at").eq("user_id", user.id).in("decision_label", ["pass", "trap_watch"]).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Live games pulse
  const { data: liveGamesCount } = useQuery({
    queryKey: ["cc-live-count"],
    queryFn: async () => {
      const { count } = await supabase.from("games").select("id", { count: "exact", head: true }).in("status", ["live", "in_progress"]);
      return count || 0;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const filteredOpps = useMemo(() => {
    if (!opportunities) return [];
    return opportunities.filter((o: any) => !o.mode_relevance_tags?.length || o.mode_relevance_tags.includes(activeMode));
  }, [opportunities, activeMode]);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="space-y-0.5">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Command Center</h2>
        <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Astra Ritual Intelligence</p>
      </div>

      {/* Mode Selector */}
      <TooltipProvider delayDuration={300}>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {modes.map((m) => {
            const Icon = MODE_ICONS[m.icon_name] || Sparkles;
            const isActive = m.mode_key === activeMode;
            return (
              <Tooltip key={m.mode_key}>
                <TooltipTrigger asChild>
                  <button onClick={() => setMode(m.mode_key as AstraMode)}
                    className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border",
                      isActive ? "bg-primary/15 text-primary border-primary/30 shadow-sm" : "bg-card/50 text-muted-foreground border-border/30 hover:bg-card hover:text-foreground")}>
                    <Icon className="w-3.5 h-3.5" />
                    {m.mode_name}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-0.5">{m.mode_name} Mode</p>
                  <p className="text-muted-foreground">{m.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {activeModeConfig && (
        <button onClick={() => setExpandedMode(!expandedMode)} className="w-full text-left group">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] text-muted-foreground/70 italic flex-1">{activeModeConfig.description}</p>
            {expandedMode ? <ChevronUp className="w-3 h-3 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
          </div>
          {expandedMode && (
            <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-foreground/80 leading-relaxed">
              <p className="font-semibold text-primary mb-1">Why {activeModeConfig.mode_name}?</p>
              <p>{MODE_IMPORTANCE[activeMode] || activeModeConfig.description}</p>
            </div>
          )}
        </button>
      )}

      {/* Ask Astra */}
      <div className="relative">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAstra()}
          placeholder="Ask Astra a betting question…"
          className="w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40" />
        <button onClick={askAstra} disabled={isAsking || !query.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {verdict && <AstraVerdictCard verdict={verdict} />}

      <div className="flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((chip) => (
          <button key={chip.label} onClick={() => setQuery(chip.label)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-card/50 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-card transition-all">
            <chip.icon className="w-3 h-3" />{chip.label}
          </button>
        ))}
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DashCard title="Astra Pulse" icon={Activity}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", (liveGamesCount ?? 0) > 0 ? "bg-cosmic-green animate-pulse" : "bg-muted-foreground")} />
              <span className="text-[11px] text-foreground font-semibold">
                {(liveGamesCount ?? 0) > 0 ? `${liveGamesCount} live game${liveGamesCount !== 1 ? "s" : ""} · Scanning` : "No live games — pregame analysis mode"}
              </span>
            </div>
            {profile && (
              <p className="text-[10px] text-muted-foreground">
                {ARCHETYPE_META[profile.betting_archetype]?.emoji}{" "}{ARCHETYPE_META[profile.betting_archetype]?.label || profile.betting_archetype}{" · "}{activeModeConfig?.mode_name || activeMode} mode
              </p>
            )}
            {filteredOpps.length > 0 && <p className="text-[10px] text-cosmic-green font-semibold">{filteredOpps.length} opportunit{filteredOpps.length === 1 ? "y" : "ies"} detected</p>}
          </div>
        </DashCard>

        <DashCard title="Best Opportunities" icon={Target}>
          {filteredOpps.length === 0 ? <p className="text-[11px] text-muted-foreground">No active opportunities right now.</p> : (
            <div className="space-y-1.5">
              {filteredOpps.slice(0, 3).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground truncate flex-1">{o.headline}</span>
                  {o.confidence != null && <span className="text-primary font-bold tabular-nums ml-2">{(o.confidence * 100).toFixed(0)}%</span>}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        <DashCard title="Trap Watch" icon={AlertTriangle}>
          {(recentTraps?.length ?? 0) === 0 ? <p className="text-[11px] text-muted-foreground">No active trap alerts.</p> : (
            <div className="space-y-1">
              {recentTraps!.slice(0, 3).map((t: any) => (
                <div key={t.id} className="text-[10px]">
                  <span className="text-cosmic-red font-semibold">⚠</span>{" "}
                  <span className="text-foreground">{t.warning_note || t.market_type || "Trap detected"}</span>
                  {t.trap_score != null && <span className="text-muted-foreground ml-1">({Math.round(t.trap_score * 100)}%)</span>}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        <DashCard title="Cosmic Windows" icon={Moon} dimmed={activeMode === "sharp"}>
          <p className="text-[11px] text-muted-foreground">
            {activeMode === "sharp" ? "Cosmic layer de-emphasized in Sharp mode." : activeMode === "ritual" ? "Full cosmic window analysis active." : "Planetary hour and transit windows available."}
          </p>
        </DashCard>

        <DashCard title="Slip Health" icon={Heart}>
          {!slipHealth || slipHealth.activeCount === 0 ? <p className="text-[11px] text-muted-foreground">No active slips to monitor.</p> : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-foreground font-semibold">{slipHealth.activeCount} active slip{slipHealth.activeCount !== 1 ? "s" : ""}</span>
                <span className="text-muted-foreground">{slipHealth.totalLegs} legs</span>
              </div>
              {slipHealth.hitLegs > 0 && <p className="text-[10px] text-cosmic-green font-semibold">✓ {slipHealth.hitLegs} hit</p>}
              {slipHealth.dangerLegs > 0 && <p className="text-[10px] text-cosmic-red font-semibold">⚠ {slipHealth.dangerLegs} struggling</p>}
            </div>
          )}
        </DashCard>

        <DashCard title="Opportunity Feed" icon={Zap}>
          {filteredOpps.length === 0 ? <p className="text-[11px] text-muted-foreground">Feed empty. Waiting for model outputs…</p> : (
            <div className="space-y-1">{filteredOpps.slice(0, 5).map((o: any) => (<div key={o.id} className="text-[10px] text-muted-foreground truncate">{o.headline}</div>))}</div>
          )}
        </DashCard>
      </div>

      {/* Personal Profile Section */}
      {profile && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Your Betting Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Best Markets */}
            {profile.best_performing_markets.length > 0 && (
              <DashCard title="Best Markets For You" icon={Target}>
                <div className="flex flex-wrap gap-1">
                  {profile.best_performing_markets.map(m => (
                    <Badge key={m} variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-cosmic-green/30 text-cosmic-green">{m}</Badge>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Your highest win rate markets</p>
              </DashCard>
            )}
            {/* Leak Zones */}
            {profile.worst_performing_markets.length > 0 && (
              <DashCard title="Leak Zones" icon={AlertTriangle}>
                <div className="flex flex-wrap gap-1">
                  {profile.worst_performing_markets.map(m => (
                    <Badge key={m} variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-destructive/30 text-destructive">{m}</Badge>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Markets where you underperform — be cautious</p>
              </DashCard>
            )}
            {/* Strongest Stats */}
            {profile.strongest_stat_types.length > 0 && (
              <DashCard title="Strongest Stat Types" icon={TrendingUp}>
                <div className="flex flex-wrap gap-1">
                  {profile.strongest_stat_types.map(s => (
                    <Badge key={s} variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-primary/30 text-primary">{s}</Badge>
                  ))}
                </div>
              </DashCard>
            )}
            {/* Coaching */}
            <DashCard title="Coaching Notes" icon={Sparkles}>
              <div className="space-y-1 text-[10px] text-muted-foreground">
                {profile.over_under_bias > 0.2 && <p>📊 Heavy over lean — consider balancing with under plays</p>}
                {profile.over_under_bias < -0.2 && <p>📊 Heavy under lean — you may miss upside opportunities</p>}
                {profile.high_volatility_tendency > 0.4 && <p>🎰 High volatility tolerance — ensure you're getting +EV, not just big odds</p>}
                {profile.same_game_stack_tendency > 0.3 && <p>📚 Frequent SGP stacking — watch correlation risk</p>}
                {profile.risk_tolerance === "aggressive" && <p>⚠ Aggressive risk profile — Astra will flag when you're overexposed</p>}
                {profile.risk_tolerance === "conservative" && <p>🎯 Conservative approach — Astra will highlight your highest-conviction spots</p>}
                {profile.best_performing_markets.length === 0 && profile.worst_performing_markets.length === 0 && <p>Not enough data yet. Keep betting to build your profile.</p>}
              </div>
            </DashCard>
          </div>
        </div>
      )}

      <AstraAssessmentHistory limit={5} />
    </div>
  );
}

function DashCard({ title, icon: Icon, dimmed, children }: { title: string; icon: any; dimmed?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm p-4 space-y-2 transition-opacity", dimmed && "opacity-50")}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
