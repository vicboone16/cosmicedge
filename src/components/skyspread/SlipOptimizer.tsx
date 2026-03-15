import { useState } from "react";
import {
  CheckCircle, Eye, Zap, BarChart3, ArrowUpDown, TrendingUp,
  Shield, Rocket, RefreshCw, Save, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Brain, Target, Activity, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSlipOptimizer } from "@/hooks/use-slip-optimizer";
import { useIsAdmin } from "@/hooks/use-admin";
import type { SlipScore, LegScore } from "@/lib/slip-optimizer-engine";
import { SlipLiveTracker } from "./optimizer/SlipLiveTracker";
import { SlipLegDetailDrawer } from "./optimizer/SlipLegDetailDrawer";
import { SlipReplacementDrawer } from "./optimizer/SlipReplacementDrawer";
import { SlipVersionCompare } from "./optimizer/SlipVersionCompare";
import { SlipHedgeWatch } from "./optimizer/SlipHedgeWatch";
import { SlipRebuildSuggestions } from "./optimizer/SlipRebuildSuggestions";

export type SlipIntent = "already_placed" | "thinking" | "building" | "tracking_only";

export const INTENT_CONFIG: Record<SlipIntent, { label: string; description: string; icon: any; color: string }> = {
  already_placed: { label: "Already Placed", description: "Advisory & tracking mode", icon: CheckCircle, color: "text-cosmic-green" },
  thinking: { label: "Thinking About Placing", description: "Full optimizer mode", icon: Eye, color: "text-cosmic-gold" },
  building: { label: "Building / Comparing", description: "Editable experiment mode", icon: Zap, color: "text-cosmic-cyan" },
  tracking_only: { label: "Tracking Only", description: "Monitor & grade", icon: BarChart3, color: "text-muted-foreground" },
};

/* ─── Intent Selector ─── */
export function SlipIntentSelector({
  value, onChange, compact = false,
}: { value: SlipIntent; onChange: (v: SlipIntent) => void; compact?: boolean }) {
  const intents = Object.entries(INTENT_CONFIG) as [SlipIntent, typeof INTENT_CONFIG[SlipIntent]][];
  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        {intents.map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => onChange(key)}
              className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold transition-colors border",
                value === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="h-3 w-3" />{cfg.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Slip Status</p>
      <div className="grid grid-cols-2 gap-1.5">
        {intents.map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => onChange(key)}
              className={cn("flex flex-col items-start gap-1 p-2.5 rounded-lg border transition-all text-left",
                value === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              )}>
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", value === key ? "text-primary" : cfg.color)} />
                <span className={cn("text-[11px] font-semibold", value === key ? "text-foreground" : "text-muted-foreground")}>{cfg.label}</span>
              </div>
              <span className="text-[9px] text-muted-foreground">{cfg.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── EV Grade Badge ─── */
function EvGradeBadge({ grade }: { grade: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    plus_ev: { label: "+EV", className: "bg-cosmic-green/15 text-cosmic-green" },
    playable: { label: "Playable", className: "bg-cosmic-gold/15 text-cosmic-gold" },
    neutral: { label: "Neutral", className: "bg-muted/30 text-muted-foreground" },
    minus_ev: { label: "−EV", className: "bg-cosmic-red/15 text-cosmic-red" },
  };
  const c = cfg[grade] || cfg.neutral;
  return <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase", c.className)}>{c.label}</span>;
}

/* ─── Correlation Badge ─── */
function CorrelationBadge({ level }: { level: string }) {
  const cfg: Record<string, { className: string }> = {
    low: { className: "text-cosmic-green border-cosmic-green/30" },
    moderate: { className: "text-cosmic-gold border-cosmic-gold/30" },
    high: { className: "text-cosmic-red border-cosmic-red/30" },
    extreme: { className: "text-cosmic-red border-cosmic-red/50" },
  };
  const c = cfg[level] || cfg.low;
  return <Badge variant="outline" className={cn("text-[8px] capitalize", c.className)}>{level} Corr</Badge>;
}

/* ─── Slip Summary Card ─── */
function SlipSummaryCard({ score, slip }: { score: SlipScore; slip: any }) {
  const gradeColor = score.score >= 80 ? "text-cosmic-green" : score.score >= 65 ? "text-cosmic-gold" : score.score >= 50 ? "text-cosmic-cyan" : "text-cosmic-red";
  const riskColor = score.riskLevel === "Low" ? "text-cosmic-green" : score.riskLevel === "Moderate" ? "text-cosmic-gold" : "text-cosmic-red";

  return (
    <div className="p-3 rounded-xl bg-secondary/20 border border-border space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className={cn("text-xl font-black", gradeColor)}>{score.grade}</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-2xl font-black tabular-nums", gradeColor)}>{score.score}</span>
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
            <p className="text-[9px] text-muted-foreground">{score.confidenceLabel} · {score.legCount} legs</p>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="flex items-center gap-1 justify-end">
            <Badge variant="outline" className={cn("text-[9px]", riskColor)}>
              {score.riskLevel} Risk
            </Badge>
            <EvGradeBadge grade={score.evGrade} />
          </div>
          {slip?.entry_type && (
            <p className="text-[8px] text-muted-foreground capitalize">{slip.entry_type}</p>
          )}
        </div>
      </div>

      {/* Stats row — now 2 rows with EV + correlation */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Hit Prob" value={`${(score.avgHitProbability * 100).toFixed(0)}%`} />
        <StatPill label="Survival" value={`${(score.slipSurvivalProbability * 100).toFixed(1)}%`} />
        <StatPill label="EV" value={`${score.expectedValue >= 0 ? "+" : ""}${score.expectedValue.toFixed(2)}u`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Avg Edge" value={`${score.avgEdge.toFixed(1)}%`} />
        <StatPill label="Avg Vol" value={`${score.avgVolatility.toFixed(0)}%`} />
        <div className="text-center p-1.5 rounded-lg bg-secondary/40 flex items-center justify-center gap-1">
          <CorrelationBadge level={score.correlation.riskLevel} />
        </div>
      </div>

      {/* Stake/Payout */}
      {(slip?.stake || slip?.payout) && (
        <div className="grid grid-cols-2 gap-2">
          {slip.stake > 0 && <StatPill label="Stake" value={`$${Number(slip.stake).toFixed(2)}`} />}
          {slip.payout > 0 && <StatPill label="Payout" value={`$${Number(slip.payout).toFixed(2)}`} />}
        </div>
      )}

      {/* Optimization note */}
      {score.optimizationNote && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-cosmic-gold/5 border border-cosmic-gold/20">
          <Zap className="h-3 w-3 text-cosmic-gold shrink-0 mt-0.5" />
          <p className="text-[9px] text-cosmic-gold">{score.optimizationNote}</p>
        </div>
      )}

      {/* Correlation notes */}
      {score.correlation.notes.length > 0 && score.correlation.riskLevel !== "low" && (
        <div className="space-y-0.5">
          {score.correlation.notes.map((note, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] text-cosmic-gold">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Risk flags */}
      {score.riskFlags.length > 0 && (
        <div className="space-y-1">
          {score.riskFlags.map((flag, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] text-cosmic-gold">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg bg-secondary/40">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="text-xs font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

/* ─── Leg Analysis Card ─── */
function LegAnalysisCard({ leg, rank, onTap }: { leg: LegScore; rank: "strongest" | "weakest" | "neutral"; onTap: () => void }) {
  const scoreColor = leg.score >= 75 ? "text-cosmic-green" : leg.score >= 55 ? "text-cosmic-gold" : "text-cosmic-red";
  const probColor = leg.hitProbability >= 0.70 ? "text-cosmic-green" : leg.hitProbability >= 0.45 ? "text-cosmic-gold" : "text-cosmic-red";

  return (
    <button onClick={onTap} className={cn("w-full rounded-lg border transition-all text-left",
      rank === "strongest" ? "border-cosmic-green/30 bg-cosmic-green/5" :
      rank === "weakest" ? "border-cosmic-red/30 bg-cosmic-red/5" :
      "border-border bg-secondary/20"
    )}>
      <div className="p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0",
              rank === "strongest" ? "bg-cosmic-green/15 text-cosmic-green" :
              rank === "weakest" ? "bg-cosmic-red/15 text-cosmic-red" :
              "bg-secondary text-muted-foreground"
            )}>
              {leg.grade}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-foreground truncate">{leg.player_name_raw}</p>
              <p className="text-[9px] text-muted-foreground capitalize">{leg.stat_type} · {leg.direction} {leg.line}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-xs font-bold tabular-nums", scoreColor)}>{leg.score}</span>
            {leg.isSynthetic && <Badge variant="outline" className="text-[7px] px-1 py-0 text-cosmic-cyan border-cosmic-cyan/30">Imported</Badge>}
            {rank !== "neutral" && (
              <Badge variant="outline" className={cn("text-[7px] px-1 py-0",
                rank === "strongest" ? "text-cosmic-green border-cosmic-green/30" : "text-cosmic-red border-cosmic-red/30"
              )}>
                {rank === "strongest" ? "★ Best" : "⚠ Weakest"}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>

        {/* Intelligence row */}
        <div className="flex items-center gap-2 text-[8px]">
          <span className={cn("font-bold", probColor)}>{(leg.hitProbability * 100).toFixed(0)}% hit</span>
          {leg.liveEdge != null && (
            <span className={cn("font-semibold", leg.liveEdge > 0 ? "text-cosmic-green" : "text-cosmic-red")}>
              {leg.liveEdge > 0 ? "+" : ""}{leg.liveEdge.toFixed(1)}% edge
            </span>
          )}
          {leg.pacePct != null && (
            <span className={cn("font-semibold", leg.pacePct >= 100 ? "text-cosmic-green" : "text-cosmic-gold")}>
              {leg.pacePct}% pace
            </span>
          )}
          {leg.foulRiskLevel !== "low" && (
            <span className="text-cosmic-red font-semibold">⚠ {leg.foulRiskLevel}</span>
          )}
          {leg.statusLabel && leg.statusLabel !== "pregame" && (
            <span className={cn("font-bold uppercase",
              leg.statusLabel === "likely_hit" ? "text-cosmic-green" :
              leg.statusLabel === "danger" ? "text-cosmic-red" : "text-cosmic-gold"
            )}>{leg.statusLabel.replace("_", " ")}</span>
          )}
        </div>

        {/* Weakness reason for weakest leg */}
        {rank === "weakest" && leg.weaknessReason && (
          <p className="text-[8px] text-cosmic-red italic">↳ {leg.weaknessReason}</p>
        )}

        {/* Astro note */}
        {leg.astroNote && (
          <p className="text-[8px] text-cosmic-purple italic">✦ {leg.astroNote}</p>
        )}
      </div>
    </button>
  );
}

/* ─── Confidence Distribution ─── */
function ConfidenceDistribution({ legs }: { legs: LegScore[] }) {
  const sorted = [...legs].sort((a, b) => a.score - b.score);
  return (
    <div className="p-2.5 rounded-lg bg-secondary/20 border border-border">
      <p className="text-[10px] font-semibold text-muted-foreground mb-2">Confidence Distribution</p>
      <div className="space-y-1">
        {sorted.map((leg) => (
          <div key={leg.id} className="flex items-center gap-2">
            <span className="text-[8px] text-muted-foreground w-16 truncate">{leg.player_name_raw.split(" ").pop()}</span>
            <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
              <div className={cn("h-full rounded-full transition-all",
                leg.score >= 75 ? "bg-cosmic-green" : leg.score >= 55 ? "bg-cosmic-gold" : "bg-cosmic-red"
              )} style={{ width: `${leg.score}%` }} />
            </div>
            <span className="text-[8px] font-bold tabular-nums text-muted-foreground w-6 text-right">{leg.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── AI Analysis Panel ─── */
function AiAnalysisPanel({ analysis, loading, action }: { analysis: string | null; loading: boolean; action: string | null }) {
  if (!loading && !analysis) return null;
  return (
    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
      <div className="flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-semibold text-primary">AI Slip Optimizer</p>
        {action && <Badge variant="outline" className="text-[7px] ml-auto capitalize">{action.replace(/_/g, " ")}</Badge>}
        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />}
      </div>
      {loading && !analysis && (
        <div className="space-y-1.5">
          <div className="h-3 bg-primary/10 rounded animate-pulse w-full" />
          <div className="h-3 bg-primary/10 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-primary/10 rounded animate-pulse w-3/5" />
        </div>
      )}
      {analysis && (
        <div className="text-[10px] text-foreground leading-relaxed whitespace-pre-wrap prose-sm">
          {analysis.split(/\*\*(.*?)\*\*/g).map((part, i) =>
            i % 2 === 1
              ? <strong key={i} className="text-primary">{part}</strong>
              : <span key={i}>{part}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Admin Debug Panel (Phase 8 Enhanced) ─── */
function AdminDebugPanel({ score }: { score: SlipScore }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5">
      <button onClick={() => setOpen(!open)} className="w-full p-2 flex items-center justify-between text-left">
        <span className="text-[9px] font-semibold text-destructive flex items-center gap-1"><Brain className="h-3 w-3" /> Admin Debug</span>
        {open ? <ChevronUp className="h-3 w-3 text-destructive" /> : <ChevronDown className="h-3 w-3 text-destructive" />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 text-[8px] font-mono text-muted-foreground">
          <p className="font-bold text-destructive border-b border-destructive/10 pb-1">Slip Metrics</p>
          <p>slip_score: {score.score} | grade: {score.grade} | risk: {score.riskLevel}</p>
          <p>ev: {score.expectedValue} | ev_grade: {score.evGrade} | survival: {(score.slipSurvivalProbability * 100).toFixed(1)}%</p>
          <p>avg_hit_prob: {(score.avgHitProbability * 100).toFixed(1)}% | avg_edge: {score.avgEdge} | avg_vol: {score.avgVolatility}</p>
          <p>corr_score: {score.correlation.score} | corr_risk: {score.correlation.riskLevel} | variance_conc: {score.varianceConcentration}</p>
          <p>weakest_idx: {score.weakestLegIdx} | weakest_reason: {score.weakestLegReason || "none"}</p>
          <p>swap_priority: {score.swapPriorityLegId || "none"} | opt_note: {score.optimizationNote || "none"}</p>

          <p className="font-bold text-destructive border-b border-destructive/10 pb-1 pt-1">Per-Leg Detail</p>
          {score.legs.map((l, i) => (
            <div key={i} className={cn("p-1 rounded", i === score.weakestLegIdx ? "bg-cosmic-red/10" : i === score.strongestLegIdx ? "bg-cosmic-green/10" : "")}>
              <p className="font-semibold">[{i}] {l.player_name_raw} {i === score.weakestLegIdx ? "⚠ WEAKEST" : i === score.strongestLegIdx ? "★ STRONGEST" : ""}</p>
              <p>score={l.score} grade={l.grade} hitP={l.hitProbability.toFixed(3)} implP={l.impliedProbability?.toFixed(3) ?? "—"}</p>
              <p>edge={l.edge} liveEdge={l.liveEdge ?? "—"} EV={l.expectedReturn ?? "—"} | pacePct={l.pacePct ?? "—"}</p>
              <p>minSec={l.minutesSecurity} projMin={l.projectedMinutes ?? "—"} | foul={l.foulRiskLevel} blowout={l.blowoutProbability}</p>
              <p>vol={l.volatility} matchup={l.matchup_quality} | status={l.statusLabel} astro={l.astroNote || "—"}</p>
              <p>weakness={l.weaknessReason || "none"} | flags=[{l.flags.join(",")}] | synthetic={String(l.isSynthetic)}</p>
              <p>game_id={l.game_id?.slice(0, 8) ?? "—"}</p>
            </div>
          ))}

          {score.correlation.clusters.length > 0 && (
            <div className="border-t border-destructive/10 pt-1 mt-1">
              <p className="font-bold text-destructive">Correlation Clusters ({score.correlation.clusters.length})</p>
              {score.correlation.clusters.map((c, i) => (
                <div key={i} className="p-1 rounded bg-cosmic-red/5">
                  <p>cluster[{i}] type={c.type} risk={c.risk} legs={c.legs.length}</p>
                  <p className="text-[7px]">leg_ids: {c.legs.map(id => id.slice(0, 6)).join(", ")}</p>
                  <p className="text-[7px]">game: {c.game_id.slice(0, 8)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Optimizer Panel ─── */
interface SlipOptimizerProps {
  slip: any;
  picks: any[];
  intentState: SlipIntent;
  onAction?: (action: string) => void;
}

export function SlipOptimizerPanel({ slip, picks, intentState, onAction }: SlipOptimizerProps) {
  const { slipScore, aiAnalysis, aiLoading, lastAction, runAiAction } = useSlipOptimizer({
    slip, picks, intentState,
  });
  const { isAdmin } = useIsAdmin();
  const [selectedLeg, setSelectedLeg] = useState<{ leg: LegScore; pick: any } | null>(null);
  const [showReplacements, setShowReplacements] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [replacementAnalysis, setReplacementAnalysis] = useState<string | null>(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [versionAnalysis, setVersionAnalysis] = useState<string | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [rebuildAnalysis, setRebuildAnalysis] = useState<string | null>(null);
  const [rebuildLoading, setRebuildLoading] = useState(false);

  if (!picks || picks.length === 0) return null;

  const isPlaced = intentState === "already_placed";
  const isThinking = intentState === "thinking";
  const isBuilding = intentState === "building";
  const isTracking = intentState === "tracking_only";

  const handleAction = (action: string) => {
    onAction?.(action);
    runAiAction(action);
  };

  const handleReplacementRequest = async () => {
    setReplacementLoading(true);
    setReplacementAnalysis(null);
    try {
      await runAiAction("replace_weakest");
      // The AI analysis from the hook will be captured via the shared state
    } catch {}
    setReplacementLoading(false);
  };

  const handleVersionCompare = async () => {
    setVersionLoading(true);
    setVersionAnalysis(null);
    try {
      await runAiAction("compare_versions");
    } catch {}
    setVersionLoading(false);
  };

  const handleRebuild = async () => {
    setRebuildLoading(true);
    setRebuildAnalysis(null);
    try {
      await runAiAction("rebuild_suggestions");
    } catch {}
    setRebuildLoading(false);
  };

  const weakestLeg = slipScore.legs[slipScore.weakestLegIdx] ?? null;

  return (
    <div className="space-y-3 pt-2">
      {/* A. Slip Summary Card */}
      <SlipSummaryCard score={slipScore} slip={slip} />

      {/* B. Leg Analysis */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Target className="h-3 w-3" /> Leg Analysis
        </p>
        {slipScore.legs.map((leg, idx) => (
          <LegAnalysisCard
            key={leg.id}
            leg={leg}
            rank={idx === slipScore.strongestLegIdx ? "strongest" : idx === slipScore.weakestLegIdx ? "weakest" : "neutral"}
            onTap={() => setSelectedLeg({ leg, pick: picks[idx] })}
          />
        ))}
      </div>

      {/* C. Confidence Distribution */}
      <ConfidenceDistribution legs={slipScore.legs} />

      {/* D. Live Tracking (all modes) */}
      <SlipLiveTracker picks={picks} />

      {/* ═══════════ ALREADY PLACED ═══════════ */}
      {isPlaced && (
        <>
          {/* Hedge Watch */}
          <SlipHedgeWatch score={slipScore} picks={picks} />

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={TrendingUp} label="Track Live" onClick={() => handleAction("track_live")} />
            <ActionBtn icon={BarChart3} label="Evaluate" onClick={() => handleAction("evaluate")} />
            <ActionBtn icon={Shield} label="Hedge Ideas" onClick={() => handleAction("hedge_ideas")} />
            <ActionBtn icon={Save} label="Save Template" onClick={() => onAction?.("save_template")} />
          </div>

          {/* Rebuild Suggestions */}
          <SlipRebuildSuggestions
            analysis={lastAction === "rebuild_suggestions" ? aiAnalysis : rebuildAnalysis}
            loading={lastAction === "rebuild_suggestions" ? aiLoading : rebuildLoading}
            onRequest={() => handleAction("rebuild_suggestions")}
          />
        </>
      )}

      {/* ═══════════ THINKING ABOUT PLACING ═══════════ */}
      {isThinking && (
        <>
          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={Zap} label="Optimize Slip" primary onClick={() => handleAction("optimize")} />
            <ActionBtn icon={ArrowUpDown} label="Replace Weakest" onClick={() => { setShowReplacements(true); handleAction("replace_weakest"); }} />
            <ActionBtn icon={Shield} label="Reduce Risk" onClick={() => handleAction("reduce_risk")} />
            <ActionBtn icon={Rocket} label="Increase Upside" onClick={() => handleAction("increase_upside")} />
          </div>
          <ActionBtn icon={RefreshCw} label="Compare Better Version" full onClick={() => handleAction("compare_better")} />

          {/* Replacement Drawer */}
          {showReplacements && (
            <SlipReplacementDrawer
              weakestLeg={weakestLeg}
              aiSuggestions={lastAction === "replace_weakest" ? aiAnalysis : null}
              loading={lastAction === "replace_weakest" && aiLoading}
              onRequestSuggestions={() => handleAction("replace_weakest")}
              existingGameIds={picks.map((p: any) => p.game_id).filter(Boolean)}
              existingPlayerNames={picks.map((p: any) => p.player_name_raw).filter(Boolean)}
            />
          )}

          {/* Hedge Watch */}
          <SlipHedgeWatch score={slipScore} picks={picks} />
        </>
      )}

      {/* ═══════════ BUILDING ═══════════ */}
      {isBuilding && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={Zap} label="Optimize" primary onClick={() => handleAction("optimize")} />
            <ActionBtn icon={ArrowUpDown} label="Swap Leg" onClick={() => { setShowReplacements(true); handleAction("replace_weakest"); }} />
            <ActionBtn icon={RefreshCw} label="Compare Versions" onClick={() => { setShowVersions(true); handleAction("compare_versions"); }} />
            <ActionBtn icon={Save} label="Save Version" onClick={() => onAction?.("save_version")} />
          </div>

          {/* Version Compare */}
          {showVersions && (
            <SlipVersionCompare
              aiVersions={lastAction === "compare_versions" ? aiAnalysis : null}
              loading={lastAction === "compare_versions" && aiLoading}
              onCompare={() => handleAction("compare_versions")}
            />
          )}

          {/* Replacement Drawer */}
          {showReplacements && (
            <SlipReplacementDrawer
              weakestLeg={weakestLeg}
              aiSuggestions={lastAction === "replace_weakest" ? aiAnalysis : null}
              loading={lastAction === "replace_weakest" && aiLoading}
              onRequestSuggestions={() => handleAction("replace_weakest")}
            />
          )}
        </>
      )}

      {/* ═══════════ TRACKING ONLY ═══════════ */}
      {isTracking && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={TrendingUp} label="Track Live" onClick={() => handleAction("track_live")} />
            <ActionBtn icon={BarChart3} label="Grade Slip" onClick={() => handleAction("evaluate")} />
          </div>
          <SlipHedgeWatch score={slipScore} picks={picks} />
        </>
      )}

      {/* AI Analysis output (all modes) */}
      <AiAnalysisPanel analysis={aiAnalysis} loading={aiLoading} action={lastAction} />

      {/* Admin Debug */}
      {isAdmin && <AdminDebugPanel score={slipScore} />}

      {/* Summary */}
      <div className="p-2 rounded-lg bg-secondary/20 border border-border">
        <div className="flex items-start gap-1.5">
          <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[9px] text-muted-foreground">{slipScore.summary}</p>
        </div>
      </div>

      {/* Leg Detail Drawer */}
      {selectedLeg && (
        <SlipLegDetailDrawer
          leg={selectedLeg.leg}
          pick={selectedLeg.pick}
          onClose={() => setSelectedLeg(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, primary, full }: {
  icon: any; label: string; onClick: () => void; primary?: boolean; full?: boolean
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      size="sm"
      className={cn("text-[10px] h-8 gap-1", full && "w-full col-span-2")}
      onClick={onClick}
    >
      <Icon className="h-3 w-3" /> {label}
    </Button>
  );
}
