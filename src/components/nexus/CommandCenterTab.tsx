import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAstraMode, type AstraMode } from "@/hooks/use-astra-mode";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Sparkles, Crosshair, Shield, Eye, Moon,
  Activity, Target, AlertTriangle, Heart, Zap,
  Send, ArrowRight, Loader2, ChevronDown, ChevronUp,
  User, BarChart3, Star, TrendingUp,
} from "lucide-react";
import AstraVerdictCard, { type AstraVerdict } from "@/components/astra/AstraVerdictCard";
import AstraAssessmentHistory from "@/components/astra/AstraAssessmentHistory";
import { useBettingProfile, ARCHETYPE_META } from "@/hooks/use-betting-profile";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TwinklingStars } from "@/components/slate/TwinklingStars";

/* ─── Static styles ─── */
const glassCard =
  "backdrop-blur-xl bg-[#e8dff5]/40 border border-[#c4b0e0]/40 shadow-lg rounded-xl";
const goldGlass =
  "backdrop-blur-xl bg-gradient-to-br from-[#f5e6c8]/50 to-[#e8d5a8]/30 border border-[#d4b978]/50 shadow-lg rounded-xl";

/* ─── Mode definitions ─── */
type ModeMeta = {
  icon: React.ElementType;
  emoji: string;
  label: string;
  desc: string;
  activeClass: string;
  inactiveClass: string;
};

const MODE_META: Record<string, ModeMeta> = {
  pra_sniper: {
    icon: Target,
    emoji: "🏆",
    label: "PRA Sniper",
    desc: "Locks onto the highest-confidence Points + Rebounds + Assists bets only. Zero noise, pure signal.",
    activeClass:
      "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-amber-950 border-amber-400 shadow-amber-400/40 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-amber-400/40 hover:text-amber-600",
  },
  sniper: {
    icon: Crosshair,
    emoji: "🎯",
    label: "Sniper",
    desc: "S-Tier and A-Tier precision picks only — the highest model agreement across all stat categories.",
    activeClass:
      "bg-gradient-to-r from-violet-500 to-purple-500 text-white border-violet-400 shadow-violet-400/30 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-violet-400/40 hover:text-violet-500",
  },
  cosmic: {
    icon: Sparkles,
    emoji: "🔮",
    label: "Cosmic",
    desc: "Picks ranked by planetary alignment strength and cosmic timing score.",
    activeClass:
      "bg-gradient-to-r from-sky-400 to-cyan-400 text-sky-950 border-sky-400 shadow-sky-400/30 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-sky-400/40 hover:text-sky-500",
  },
  hedge: {
    icon: Shield,
    emoji: "🛡️",
    label: "Hedge",
    desc: "Conservative, low-variance plays. Best for protecting slips and managing bankroll risk.",
    activeClass:
      "bg-gradient-to-r from-emerald-400 to-green-500 text-emerald-950 border-emerald-400 shadow-emerald-400/30 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-emerald-400/40 hover:text-emerald-500",
  },
  shadow: {
    icon: Eye,
    emoji: "👁️",
    label: "Shadow",
    desc: "Contrarian picks that fade the public. Trap-avoidance mode for sharp bettors.",
    activeClass:
      "bg-gradient-to-r from-pink-500 to-rose-500 text-white border-pink-400 shadow-pink-400/30 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-pink-400/40 hover:text-pink-500",
  },
  ritual: {
    icon: Moon,
    emoji: "✨",
    label: "Ritual",
    desc: "Full-spectrum blend — cosmic timing, statistical edge, and archetype all factored equally.",
    activeClass:
      "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-400 shadow-purple-400/30 shadow-lg",
    inactiveClass:
      "bg-background/60 text-muted-foreground border-border/60 hover:border-purple-400/40 hover:text-purple-500",
  },
};

/* ─── Quick Chips ─── */
const QUICK_CHIPS = [
  { label: "Good bet or pass?", icon: Target },
  { label: "Best live spot", icon: Zap },
  { label: "Safest angle", icon: Shield },
  { label: "Trap watch", icon: AlertTriangle },
  { label: "Hedge this", icon: Heart },
];

/* ─── PRA Sniper plays with stat breakdowns ─── */
const MOCK_PRA_PLAYS = [
  {
    id: "pra1",
    player: "Luka Dončić",
    team: "DAL",
    predicted: 48.5,
    line: 44.5,
    confidence: 92,
    tier: "S" as const,
    breakdown: { pts: 28.3, reb: 11.2, ast: 9.0 },
  },
  {
    id: "pra2",
    player: "Jayson Tatum",
    team: "BOS",
    predicted: 42.8,
    line: 39.5,
    confidence: 90,
    tier: "S" as const,
    breakdown: { pts: 27.4, reb: 9.8, ast: 5.6 },
  },
  {
    id: "pra3",
    player: "Nikola Jokić",
    team: "DEN",
    predicted: 52.1,
    line: 48.5,
    confidence: 88,
    tier: "S" as const,
    breakdown: { pts: 25.5, reb: 14.8, ast: 11.8 },
  },
  {
    id: "pra4",
    player: "Shai Gilgeous-Alexander",
    team: "OKC",
    predicted: 40.2,
    line: 37.5,
    confidence: 85,
    tier: "A" as const,
    breakdown: { pts: 31.2, reb: 4.8, ast: 4.2 },
  },
];

/* ─── All plays (for non-sniper modes) ─── */
const MOCK_TOP_PLAYS = [
  { id: "1", player: "Luka Dončić", team: "DAL", stat: "PRA", tier: "S" as const, predicted: 48.5, line: 44.5, confidence: 92 },
  { id: "2", player: "Jayson Tatum", team: "BOS", stat: "PRA", tier: "S" as const, predicted: 42.8, line: 39.5, confidence: 90 },
  { id: "3", player: "Nikola Jokić", team: "DEN", stat: "PRA", tier: "S" as const, predicted: 52.1, line: 48.5, confidence: 88 },
  { id: "4", player: "Shai Gilgeous-Alexander", team: "OKC", stat: "PRA", tier: "A" as const, predicted: 40.2, line: 37.5, confidence: 85 },
  { id: "5", player: "Anthony Edwards", team: "MIN", stat: "Points", tier: "A" as const, predicted: 28.4, line: 25.5, confidence: 78 },
  { id: "6", player: "Tyrese Haliburton", team: "IND", stat: "Pts+Ast", tier: "B" as const, predicted: 31.5, line: 29.5, confidence: 71 },
  { id: "7", player: "Domantas Sabonis", team: "SAC", stat: "Rebounds", tier: "A" as const, predicted: 13.2, line: 11.5, confidence: 81 },
];

const MOCK_TRAP_ALERTS = [
  { id: "t1", game: "MIA @ CLE", line: "CLE -7.5", note: "Model sees CLE -4.2. Line inflated by public money.", risk: 78 },
  { id: "t2", game: "LAL @ GSW", line: "O 228.5", note: "Both teams bottom-5 pace last 10. Model projects 219.", risk: 65 },
];

const MOCK_OPPORTUNITIES = [
  { id: "o1", player: "Dejounte Murray", stat: "Steals", edge: 18, confidence: 84 },
  { id: "o2", player: "Chet Holmgren", stat: "Blocks", edge: 22, confidence: 79 },
  { id: "o3", player: "Darius Garland", stat: "Assists", edge: 15, confidence: 76 },
];

const MOCK_SLIP_HEALTH = [
  { stat: "PRA", hitRate: 72, trend: "up" as const },
  { stat: "Points", hitRate: 64, trend: "up" as const },
  { stat: "Rebounds", hitRate: 58, trend: "flat" as const },
  { stat: "Blocks+Steals", hitRate: 41, trend: "down" as const },
];

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  S: { bg: "bg-gradient-to-r from-amber-400/90 to-yellow-500/90", text: "text-amber-950", border: "border-amber-400/60", glow: "shadow-amber-400/30" },
  A: { bg: "bg-gradient-to-r from-slate-300/90 to-slate-400/80", text: "text-slate-800", border: "border-slate-400/60", glow: "shadow-slate-300/20" },
  B: { bg: "bg-gradient-to-r from-amber-700/80 to-orange-800/70", text: "text-amber-100", border: "border-amber-700/50", glow: "shadow-amber-700/20" },
  C: { bg: "bg-gradient-to-r from-zinc-400/70 to-zinc-500/60", text: "text-zinc-900", border: "border-zinc-400/40", glow: "shadow-zinc-400/10" },
};

const TIER_EXPLANATIONS = [
  { tier: "S", desc: "90%+ model agreement — best ROI historically" },
  { tier: "A", desc: "80–89% confidence — high-value pick" },
  { tier: "B", desc: "70–79% confidence — solid value play" },
  { tier: "C", desc: "60–69% confidence — moderate edge" },
];

/* ─── Confidence arc SVG ─── */
function ConfidenceRing({
  pct,
  size = 52,
  color = "#d4a853",
}: {
  pct: number;
  size?: number;
  color?: string;
}) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5"
          stroke="rgba(255,255,255,0.12)" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5"
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  );
}

/* ─── PRA Sniper Card ─── */
function PraSniperCard({ play, index }: { play: (typeof MOCK_PRA_PLAYS)[0]; index: number }) {
  const navigate = useNavigate();
  const edge = (((play.predicted - play.line) / play.line) * 100).toFixed(1);
  const tierStyle = TIER_STYLES[play.tier];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={() => navigate("/predictions")}
      className="cursor-pointer rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#2a1f0a]/80 via-[#1e1608]/70 to-[#0f0b04]/80 backdrop-blur-xl shadow-xl shadow-amber-900/20 p-4 space-y-3 hover:border-amber-400/60 hover:shadow-amber-400/20 transition-all duration-200"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400/30 to-amber-600/20 border border-amber-400/30 flex items-center justify-center text-sm font-bold text-amber-300">
            {play.player.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-amber-50 leading-tight">{play.player}</p>
            <p className="text-[10px] text-amber-400/70 font-medium">{play.team}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-[9px] px-2 py-0.5 h-5 font-extrabold border", tierStyle.bg, tierStyle.text, tierStyle.border)}>
            {play.tier}-Tier
          </Badge>
          <ConfidenceRing pct={play.confidence} size={44} color="#f59e0b" />
        </div>
      </div>

      {/* PRA Breakdown */}
      <div className="rounded-xl bg-amber-400/[0.07] border border-amber-400/20 p-3 space-y-2">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-amber-400/60">
          <span>PRA Projection</span>
          <span className="text-amber-300 text-xs font-bold tabular-nums">{play.predicted}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "PTS", val: play.breakdown.pts, color: "text-amber-200" },
            { label: "REB", val: play.breakdown.reb, color: "text-amber-300" },
            { label: "AST", val: play.breakdown.ast, color: "text-amber-400" },
          ].map(({ label, val, color }) => (
            <div key={label} className="text-center">
              <p className={cn("text-base font-extrabold tabular-nums leading-none", color)}>{val}</p>
              <p className="text-[8px] font-bold text-amber-500/50 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        {/* Bar visualization */}
        <div className="flex gap-1 h-1.5">
          {[play.breakdown.pts, play.breakdown.reb, play.breakdown.ast].map((v, i) => (
            <div
              key={i}
              className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 opacity-80"
              style={{ flex: v }}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400/60 font-medium">Line</span>
          <span className="text-xs font-bold text-amber-200 tabular-nums">{play.line}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-extrabold tabular-nums",
            Number(edge) >= 8 ? "text-emerald-400" : Number(edge) >= 4 ? "text-amber-400" : "text-amber-500/60"
          )}>
            +{edge}% edge
          </span>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
            <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
            <span className="text-[9px] font-bold text-emerald-400">OVER</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── PRA Sniper Section ─── */
function PraSniperSection() {
  return (
    <section className="space-y-3 relative z-10">
      {/* Header banner */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400/15 via-yellow-400/10 to-amber-400/05 border border-amber-400/30">
        <div className="relative">
          <Target className="h-4 w-4 text-amber-400" />
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-amber-300 tracking-wide uppercase">
            PRA Sniper Mode Active
          </p>
          <p className="text-[9px] text-amber-400/60 leading-tight mt-0.5">
            Locked onto {MOCK_PRA_PLAYS.length} high-confidence PRA plays · Zero noise
          </p>
        </div>
        <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      </div>

      {/* PRA Cards */}
      <div className="space-y-3">
        {MOCK_PRA_PLAYS.map((play, i) => (
          <PraSniperCard key={play.id} play={play} index={i} />
        ))}
      </div>
    </section>
  );
}

/* ─── Dashboard Card ─── */
function DashboardCard({
  title, icon: Icon, accent = "neutral",
  expandable, expanded, onToggle, onClick, children,
}: {
  title: string;
  icon: React.ElementType;
  accent?: "cosmic" | "danger" | "gold" | "neutral";
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const accentColor = {
    cosmic: "text-[#a78bda]", danger: "text-red-400",
    gold: "text-[#d4a853]", neutral: "text-[#7c5dac]",
  }[accent];
  const borderHover = {
    cosmic: "hover:border-[#a78bda]/50", danger: "hover:border-red-400/40",
    gold: "hover:border-[#d4a853]/40", neutral: "hover:border-[#c4b0e0]/60",
  }[accent];

  return (
    <div
      onClick={expandable ? onToggle : onClick}
      className={cn(glassCard, "p-3 space-y-2 transition-all", borderHover, (expandable || onClick) && "cursor-pointer")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", accentColor)} />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#6b4c9a]">{title}</h4>
        </div>
        {expandable && (
          expanded
            ? <ChevronUp className="h-3 w-3 text-[#a78bda]" />
            : <ChevronDown className="h-3 w-3 text-[#a78bda]" />
        )}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function CommandCenterTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { modes, activeMode, setMode } = useAstraMode();
  const { profile } = useBettingProfile();

  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<AstraVerdict | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [pulseExpanded, setPulseExpanded] = useState(false);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);

  /* ─── Astra query ─── */
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

  /* ─── Live games ─── */
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
  const liveGamesCount = liveGames?.length || 0;

  /* ─── Filter plays by mode ─── */
  const filteredPlays = useMemo(() => {
    if (activeMode === "pra_sniper") return MOCK_TOP_PLAYS.filter(p => p.stat === "PRA");
    if (activeMode === "sniper") return MOCK_TOP_PLAYS.filter(p => p.tier === "S" || p.tier === "A");
    if (activeMode === "hedge") return [...MOCK_TOP_PLAYS].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    if (activeMode === "shadow") return [...MOCK_TOP_PLAYS].reverse().slice(0, 4);
    return MOCK_TOP_PLAYS;
  }, [activeMode]);

  return (
    /* Single TooltipProvider wraps everything — no nesting issues */
    <TooltipProvider delayDuration={400}>
      <div className="relative space-y-6">

        {/* Background stars */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <TwinklingStars />
        </div>

        {/* ═══ MODE SELECTOR ═══ */}
        <div className="relative z-10 space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-0.5">
            Analysis Mode
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {(Object.keys(MODE_META) as AstraMode[]).map((key) => {
              const meta = MODE_META[key];
              const Icon = meta.icon;
              const isActive = key === activeMode;

              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <motion.button
                      onClick={() => setMode(key)}
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={cn(
                        "relative flex items-center gap-1.5 px-3.5 py-2 rounded-full",
                        "text-xs font-bold whitespace-nowrap border transition-all duration-200",
                        isActive ? meta.activeClass : meta.inactiveClass
                      )}
                    >
                      {/* Gold shimmer ring on active PRA Sniper */}
                      {isActive && key === "pra_sniper" && (
                        <motion.span
                          layoutId="mode-active-ring"
                          className="absolute inset-0 rounded-full border-2 border-amber-300/60"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{meta.label}</span>
                    </motion.button>
                  </TooltipTrigger>

                  {/* ── Tooltip with solid background so text is always readable ── */}
                  <TooltipContent
                    side="bottom"
                    sideOffset={8}
                    className={cn(
                      "z-[200] max-w-[220px] rounded-xl border shadow-2xl p-3 space-y-1",
                      "bg-popover/98 border-border backdrop-blur-xl"
                    )}
                  >
                    <p className="text-xs font-bold text-foreground leading-tight">
                      {meta.emoji} {meta.label} Mode
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {meta.desc}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Active mode label strip */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 px-0.5"
            >
              <span className="text-[10px] text-muted-foreground/60">
                {MODE_META[activeMode]?.emoji} {MODE_META[activeMode]?.label} —
              </span>
              <span className="text-[10px] text-muted-foreground/50 leading-tight truncate">
                {MODE_META[activeMode]?.desc.slice(0, 60)}…
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ═══ PRA SNIPER VISUAL CARDS (only in pra_sniper mode) ═══ */}
        <AnimatePresence>
          {activeMode === "pra_sniper" && (
            <motion.div
              key="pra-sniper-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden relative z-10"
            >
              <PraSniperSection />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ ASK ASTRA ═══ */}
        <div className="relative z-10">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askAstra()}
            placeholder="Ask Astra a betting question…"
            className={cn(
              "w-full rounded-xl px-4 py-3 pr-12 text-sm text-foreground",
              "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#d4a853]/50",
              glassCard
            )}
          />
          <button
            onClick={askAstra}
            disabled={isAsking || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#d4a853] hover:bg-[#e8dff5]/60 transition-colors disabled:opacity-40"
          >
            {isAsking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>

        {verdict && <AstraVerdictCard verdict={verdict} />}

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5 relative z-10">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => setQuery(chip.label)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f3eef9]/60 border border-[#d4c4ec]/50 text-[#6b4c9a] hover:text-[#5a3d8a] hover:bg-[#e8dff5] transition-all"
            >
              <chip.icon className="w-3 h-3" />
              {chip.label}
            </button>
          ))}
        </div>

        {/* ═══ TODAY'S TOP PLAYS (other modes) ═══ */}
        {activeMode !== "pra_sniper" && (
          <section className="space-y-3 relative z-10">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b4c9a] flex items-center gap-2">
                <Target className="w-4 h-4 text-[#d4a853]" /> Today's Top Plays
              </h3>

              {/* Tier legend */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                    <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 flex items-center justify-center text-[8px] font-bold">i</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={8}
                  className="z-[200] max-w-[260px] rounded-xl bg-popover/98 border border-border shadow-2xl backdrop-blur-xl p-3 space-y-2"
                >
                  <p className="text-xs font-bold text-foreground">Confidence Tiers</p>
                  {TIER_EXPLANATIONS.map(t => (
                    <div key={t.tier} className="flex items-start gap-2">
                      <Badge className={cn("text-[8px] px-1.5 py-0 h-4 font-extrabold border shrink-0",
                        TIER_STYLES[t.tier].bg, TIER_STYLES[t.tier].text, TIER_STYLES[t.tier].border)}>
                        {t.tier}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground leading-tight">{t.desc}</span>
                    </div>
                  ))}
                </TooltipContent>
              </Tooltip>

              <span className="text-[9px] font-normal text-muted-foreground ml-auto">
                {MODE_META[activeMode]?.emoji} {MODE_META[activeMode]?.label}
              </span>
            </div>

            <div className="space-y-2">
              {filteredPlays.map((play) => {
                const tierStyle = TIER_STYLES[play.tier];
                const edge = (((play.predicted - play.line) / play.line) * 100).toFixed(1);
                return (
                  <div
                    key={play.id}
                    className={cn(
                      glassCard,
                      "p-4 space-y-2 hover:border-[#d4a853]/40 transition-all cursor-pointer",
                      selectedPlayId === play.id && "ring-2 ring-[#d4a853]/60 border-[#d4a853]/50 bg-[#f5e6c8]/20"
                    )}
                    onClick={() => {
                      if (selectedPlayId === play.id) navigate("/predictions");
                      else setSelectedPlayId(play.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{play.player}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">{play.team}</span>
                      </div>
                      <Badge className={cn("text-[9px] px-2 py-0.5 h-5 font-extrabold border",
                        tierStyle.bg, tierStyle.text, tierStyle.border)}>
                        {play.tier}-Tier
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-[#6b4c9a] bg-[#f3eef9]/80 px-2 py-0.5 rounded-md">{play.stat}</span>
                        <span className="text-xs text-foreground tabular-nums">
                          <span className="font-bold text-emerald-600">{play.predicted}</span>
                          <span className="text-muted-foreground mx-1">vs</span>
                          <span className="font-medium">{play.line}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold tabular-nums",
                          Number(edge) > 5 ? "text-emerald-600" : Number(edge) > 2 ? "text-amber-500" : "text-muted-foreground")}>
                          +{edge}%
                        </span>
                        <span className="text-[10px] text-[#7c5dac] font-bold tabular-nums">{play.confidence}%</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#d4a853]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══ LIVE DASHBOARD GRID ═══ */}
        <section className="space-y-3 relative z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b4c9a] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#d4a853]" /> Live Dashboard
          </h3>
          <div className="grid grid-cols-2 gap-3">

            {/* Astra Pulse */}
            <DashboardCard title="Astra Pulse" icon={Activity} accent="cosmic" expandable expanded={pulseExpanded} onToggle={() => setPulseExpanded(!pulseExpanded)}>
              <div className="flex items-center justify-center py-2">
                <div className="relative h-16 w-16">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-[#d4c4ec]/30" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="url(#pulseGrad)" strokeWidth="3" strokeDasharray="97.4" strokeDashoffset={97.4 * (1 - 0.72)} strokeLinecap="round" />
                    <defs>
                      <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#d4a853" />
                        <stop offset="100%" stopColor="#a78bda" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#d4a853]">72%</span>
                </div>
              </div>
              <p className="text-[9px] text-center text-muted-foreground leading-snug">
                Strong Mars alignment → aggression boost
              </p>
              {liveGamesCount > 0 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] text-emerald-600 font-semibold">{liveGamesCount} live</span>
                </div>
              )}
              {pulseExpanded && liveGames && liveGames.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#d4c4ec]/30 space-y-1">
                  {liveGames.map((g: any) => (
                    <button key={g.id} onClick={(e) => { e.stopPropagation(); navigate(`/game/${g.id}`); }}
                      className="w-full flex items-center justify-between px-1.5 py-1 rounded-lg bg-[#f3eef9]/60 hover:bg-[#e8dff5]/70 transition-colors text-left">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-medium text-foreground">{g.away_abbr} @ {g.home_abbr}</span>
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-foreground">{g.away_score ?? 0}-{g.home_score ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </DashboardCard>

            {/* Trap Watch */}
            <DashboardCard title="Trap Watch" icon={AlertTriangle} accent="danger" onClick={() => navigate("/astra")}>
              <div className="space-y-1.5">
                {MOCK_TRAP_ALERTS.map(trap => (
                  <div key={trap.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-foreground">{trap.game}</span>
                      <span className="text-[9px] text-red-500 font-bold tabular-nums">{trap.risk}% risk</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-snug">{trap.note}</p>
                  </div>
                ))}
              </div>
            </DashboardCard>

            {/* Slip Health */}
            <DashboardCard title="Slip Health" icon={BarChart3} accent="neutral" onClick={() => navigate("/skyspread")}>
              <div className="space-y-1.5">
                {MOCK_SLIP_HEALTH.map(s => (
                  <div key={s.stat} className="flex items-center gap-2">
                    <span className="text-[9px] font-medium text-foreground w-20 truncate">{s.stat}</span>
                    <div className="flex-1 h-1.5 bg-[#d4c4ec]/30 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", s.hitRate >= 65 ? "bg-emerald-500" : s.hitRate >= 50 ? "bg-amber-500" : "bg-red-400")}
                        style={{ width: `${s.hitRate}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-bold tabular-nums text-foreground w-7 text-right">{s.hitRate}%</span>
                    <span className="text-[9px]">{s.trend === "up" ? "🔥" : s.trend === "down" ? "⚠️" : "—"}</span>
                  </div>
                ))}
              </div>
            </DashboardCard>

            {/* Opportunities */}
            <DashboardCard title="Opportunities" icon={Zap} accent="gold" onClick={() => navigate("/predictions")}>
              <div className="space-y-1.5">
                {MOCK_OPPORTUNITIES.map(opp => (
                  <div key={opp.id} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-foreground truncate">{opp.player}</p>
                      <p className="text-[9px] text-muted-foreground">{opp.stat}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[10px] font-bold text-emerald-600 tabular-nums">+{opp.edge}% edge</p>
                      <Badge className={cn("text-[8px] px-1 py-0 h-3.5 font-bold border-0",
                        opp.confidence >= 80 ? "bg-amber-400/80 text-amber-950" : "bg-[#c4b0e0]/50 text-[#6b4c9a]")}>
                        {opp.confidence}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        </section>

        {/* ═══ BETTING PROFILE STRIP ═══ */}
        <section className="relative z-10">
          {profile ? (
            <button
              onClick={() => navigate("/profile")}
              className={cn(goldGlass, "w-full p-4 flex items-center gap-3 hover:border-[#d4a853]/60 transition-all text-left")}
            >
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#d4a853]/30 to-[#a78bda]/20 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-[#d4a853]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Your Profile</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-[#7c5dac] font-semibold">
                    {ARCHETYPE_META[profile.betting_archetype]?.emoji}{" "}
                    {ARCHETYPE_META[profile.betting_archetype]?.label || profile.betting_archetype}
                  </span>
                  <span className="text-[9px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{profile.bets_analyzed} bets analyzed</span>
                  <span className="text-[9px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{profile.risk_tolerance} risk</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#d4a853] shrink-0" />
            </button>
          ) : (
            <div className={cn(glassCard, "w-full p-4 text-center")}>
              <p className="text-xs text-muted-foreground">Track your bets to build your profile</p>
            </div>
          )}
        </section>

        <AstraAssessmentHistory limit={5} />
      </div>
    </TooltipProvider>
  );
}
