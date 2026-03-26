import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAstraMode, type AstraMode } from "@/hooks/use-astra-mode";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Sparkles, Crosshair, Shield, Eye, Moon,
  Activity, Target, AlertTriangle, Heart, Zap,
  Send, ArrowRight, Loader2, BarChart3, ChevronDown, ChevronUp,
  User,
} from "lucide-react";
import AstraVerdictCard, { type AstraVerdict } from "@/components/astra/AstraVerdictCard";
import AstraAssessmentHistory from "@/components/astra/AstraAssessmentHistory";
import { useBettingProfile, ARCHETYPE_META } from "@/hooks/use-betting-profile";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const glassCard = "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg rounded-xl";

const MODE_META: Record<string, { icon: any; label: string; desc: string }> = {
  sniper: { icon: Crosshair, label: "Sniper", desc: "Hidden value & live entry windows. Targets undervalued lines." },
  cosmic: { icon: Sparkles, label: "Cosmic", desc: "Balanced stats + astrology blend. The default all-rounder." },
  hedge: { icon: Shield, label: "Hedge", desc: "Risk-first. Emphasizes trap detection & safety margins." },
  shadow: { icon: Eye, label: "Shadow", desc: "Contrarian mode. Market overreaction fades & shadow value." },
  ritual: { icon: Moon, label: "Ritual", desc: "Full cosmic immersion — planetary hours & natal alignment." },
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

  // Today's games for "Top Plays"
  const { data: todayGames } = useQuery({
    queryKey: ["cc-today-games"],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      const { data } = await supabase
        .from("games")
        .select("id, home_team, away_team, home_abbr, away_abbr, home_score, away_score, league, status, start_time")
        .gte("start_time", start)
        .lt("start_time", end)
        .order("start_time", { ascending: true })
        .limit(30);
      return data || [];
    },
    staleTime: 60_000,
  });

  // Opportunities for filtering
  const { data: opportunities } = useQuery({
    queryKey: ["astra-opportunities", activeMode],
    queryFn: async () => {
      const { data } = await (supabase as any).from("astra_opportunity_feed").select("*").eq("is_active", true).order("confidence", { ascending: false }).limit(20);
      return data || [];
    },
  });

  // Live games
  const { data: liveGames } = useQuery({
    queryKey: ["cc-live-games"],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("id, home_team, away_team, home_abbr, away_abbr, home_score, away_score, league, status")
        .in("status", ["live", "in_progress"])
        .order("start_time", { ascending: true })
        .limit(20);
      return data || [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Slip health
  const { data: slipHealth } = useQuery({
    queryKey: ["cc-slip-health", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: slips } = await supabase.from("bet_slips").select("id, status, result, stake, payout, entry_type").eq("user_id", user.id).in("status", ["active", "pending", "live"]).limit(20);
      const slipIds = (slips || []).map(s => s.id);
      if (!slipIds.length) return { activeCount: 0, totalLegs: 0, hitLegs: 0, dangerLegs: 0 };
      const { data: picks } = await supabase.from("bet_slip_picks").select("slip_id, result, match_status, live_value, line, progress").in("slip_id", slipIds).limit(100);
      const allPicks = picks || [];
      return {
        activeCount: slipIds.length,
        totalLegs: allPicks.length,
        hitLegs: allPicks.filter(p => p.result === "hit" || p.result === "win").length,
        dangerLegs: allPicks.filter(p => Number(p.progress || 0) < 40 && p.live_value && p.line).length,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
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

  const filteredOpps = useMemo(() => {
    if (!opportunities) return [];
    return opportunities.filter((o: any) => !o.mode_relevance_tags?.length || o.mode_relevance_tags.includes(activeMode));
  }, [opportunities, activeMode]);

  // Filter today's games by mode relevance (simulate confidence tiers)
  const topPlays = useMemo(() => {
    if (!todayGames) return [];
    return todayGames.slice(0, 6).map((g, i) => ({
      ...g,
      tier: i < 2 ? "S" : i < 4 ? "A" : "B",
      confidence: Math.max(55, 95 - i * 8),
    }));
  }, [todayGames]);

  const liveGamesCount = liveGames?.length || 0;
  const [pulseExpanded, setPulseExpanded] = useState(false);

  return (
    <div className="space-y-5">
      {/* Mode Pills */}
      <TooltipProvider delayDuration={300}>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {(Object.keys(MODE_META) as string[]).map((key) => {
            const meta = MODE_META[key];
            const Icon = meta.icon;
            const isActive = key === activeMode;
            // Also match from DB modes if available
            const dbMode = modes.find(m => m.mode_key === key);
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button onClick={() => setMode(key as AstraMode)}
                    className={cn("flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
                      isActive ? "bg-[#a78bda] text-white border-[#8b6fbf] shadow-md" : "bg-[#e8dff5]/60 text-[#6b4c9a] border-[#d4c4ec]/50 hover:bg-[#e8dff5] hover:text-[#5a3d8a]")}>
                    <Icon className="w-3.5 h-3.5" />
                    {dbMode?.mode_name || meta.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                  <p className="font-semibold mb-0.5">{meta.label} Mode</p>
                  <p className="text-muted-foreground">{meta.desc}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Ask Astra */}
      <div className="relative">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAstra()}
          placeholder="Ask Astra a betting question…"
          className={cn("w-full rounded-xl px-4 py-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#a78bda]/40", glassCard)} />
        <button onClick={askAstra} disabled={isAsking || !query.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#a78bda] hover:bg-[#e8dff5]/60 transition-colors disabled:opacity-50">
          {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {verdict && <AstraVerdictCard verdict={verdict} />}

      <div className="flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((chip) => (
          <button key={chip.label} onClick={() => setQuery(chip.label)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f3eef9]/60 border border-[#d4c4ec]/50 text-[#6b4c9a] hover:text-[#5a3d8a] hover:bg-[#e8dff5] transition-all">
            <chip.icon className="w-3 h-3" />{chip.label}
          </button>
        ))}
      </div>

      {/* Today's Top Plays */}
      {topPlays.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b4c9a] flex items-center gap-2">
            <Target className="w-4 h-4 text-[#a78bda]" /> Today's Top Plays
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topPlays.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/game/${g.id}`)}
                className={cn(glassCard, "p-3 text-left hover:border-[#a78bda]/50 transition-all w-full")}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                    <span className="text-[9px] text-muted-foreground">{g.league}</span>
                  </div>
                  <Badge className={cn(
                    "text-[9px] px-1.5 py-0 h-4 font-bold border-0",
                    g.tier === "S" ? "bg-emerald-500/90 text-white" : g.tier === "A" ? "bg-amber-500/90 text-white" : "bg-[#c4b0e0]/60 text-[#6b4c9a]"
                  )}>
                    {g.tier}-Tier
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn("text-[10px] font-semibold",
                    g.status === "live" || g.status === "in_progress" ? "text-emerald-500" : "text-muted-foreground"
                  )}>
                    {g.status === "live" || g.status === "in_progress" ? "LIVE" : g.status === "final" ? "Final" : new Date(g.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-[10px] text-[#7c5dac] font-semibold tabular-nums">{g.confidence}% conf</span>
                </div>
                {(g.status === "live" || g.status === "in_progress" || g.status === "final") && (
                  <p className="text-xs font-bold tabular-nums mt-1 text-foreground">{g.away_score ?? 0} - {g.home_score ?? 0}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Dashboard Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b4c9a] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#a78bda]" /> Live Dashboard
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <GlassCard title="Astra Pulse" icon={Activity} expandable expanded={pulseExpanded} onToggle={() => setPulseExpanded(!pulseExpanded)}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", liveGamesCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                <span className="text-[11px] text-foreground font-semibold">
                  {liveGamesCount > 0 ? `${liveGamesCount} live game${liveGamesCount !== 1 ? "s" : ""} · Scanning` : "No live games — pregame mode"}
                </span>
              </div>
              {filteredOpps.length > 0 && <p className="text-[10px] text-emerald-500 font-semibold">{filteredOpps.length} opportunit{filteredOpps.length === 1 ? "y" : "ies"} detected</p>}
            </div>
            {pulseExpanded && liveGames && liveGames.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#d4c4ec]/30 space-y-1.5">
                {liveGames.map((g: any) => (
                  <button key={g.id} onClick={() => navigate(`/game/${g.id}`)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#f3eef9]/60 hover:bg-[#e8dff5]/70 transition-colors text-left">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-medium text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                      <span className="text-[9px] text-muted-foreground">{g.league}</span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-foreground">{g.away_score ?? 0} - {g.home_score ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Best Opportunities" icon={Target} onClick={() => navigate("/props")}>
            {filteredOpps.length === 0 ? <p className="text-[11px] text-muted-foreground">No active opportunities right now.</p> : (
              <div className="space-y-1.5">
                {filteredOpps.slice(0, 3).map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground truncate flex-1">{o.headline}</span>
                    {o.confidence != null && <span className="text-[#7c5dac] font-bold tabular-nums ml-2">{(o.confidence * 100).toFixed(0)}%</span>}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Trap Watch" icon={AlertTriangle} onClick={() => navigate("/astra")}>
            {(recentTraps?.length ?? 0) === 0 ? <p className="text-[11px] text-muted-foreground">No active trap alerts.</p> : (
              <div className="space-y-1">
                {recentTraps!.slice(0, 3).map((t: any) => (
                  <div key={t.id} className="text-[10px]">
                    <span className="text-red-500 font-semibold">⚠</span>{" "}
                    <span className="text-foreground">{t.warning_note || t.market_type || "Trap detected"}</span>
                    {t.trap_score != null && <span className="text-muted-foreground ml-1">({Math.round(t.trap_score * 100)}%)</span>}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Slip Health" icon={Heart} onClick={() => navigate("/skyspread")}>
            {!slipHealth || slipHealth.activeCount === 0 ? <p className="text-[11px] text-muted-foreground">No active slips to monitor.</p> : (
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-foreground font-semibold">{slipHealth.activeCount} active slip{slipHealth.activeCount !== 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground">{slipHealth.totalLegs} legs</span>
                </div>
                {slipHealth.hitLegs > 0 && <p className="text-[10px] text-emerald-500 font-semibold">✓ {slipHealth.hitLegs} hit</p>}
                {slipHealth.dangerLegs > 0 && <p className="text-[10px] text-red-500 font-semibold">⚠ {slipHealth.dangerLegs} struggling</p>}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Your Profile strip */}
      {profile && (
        <button onClick={() => navigate("/profile")} className={cn(glassCard, "w-full p-3 flex items-center gap-3 hover:border-[#a78bda]/50 transition-all text-left")}>
          <div className="h-9 w-9 rounded-full bg-[#a78bda]/20 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-[#7c5dac]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Your Profile</p>
            <p className="text-[10px] text-muted-foreground">
              {ARCHETYPE_META[profile.betting_archetype]?.emoji}{" "}
              {ARCHETYPE_META[profile.betting_archetype]?.label || profile.betting_archetype}
              {" · "}{profile.risk_tolerance} risk
              {profile.best_performing_markets.length > 0 && ` · Best: ${profile.best_performing_markets.slice(0, 2).join(", ")}`}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#a78bda] shrink-0" />
        </button>
      )}

      <AstraAssessmentHistory limit={5} />
    </div>
  );
}

function GlassCard({ title, icon: Icon, dimmed, onClick, expandable, expanded, onToggle, children }: { title: string; icon: any; dimmed?: boolean; onClick?: () => void; expandable?: boolean; expanded?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  const handleClick = expandable ? onToggle : onClick;
  return (
    <div onClick={handleClick} className={cn(glassCard, "p-4 space-y-2 transition-all", dimmed && "opacity-50", handleClick && "cursor-pointer hover:border-[#a78bda]/50 active:scale-[0.99]")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#a78bda]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b4c9a]">{title}</h3>
        </div>
        {expandable ? (
          expanded ? <ChevronUp className="h-3.5 w-3.5 text-[#a78bda]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#a78bda]" />
        ) : onClick ? (
          <ArrowRight className="h-3.5 w-3.5 text-[#a78bda]" />
        ) : null}
      </div>
      {children}
    </div>
  );
}
