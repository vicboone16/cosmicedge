import { useState } from "react";
import {
  CheckCircle, Eye, Zap, BarChart3, ArrowUpDown, TrendingUp,
  Shield, Rocket, RefreshCw, Save, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, Brain, Target, Activity, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSlipOptimizer } from "@/hooks/use-slip-optimizer";
import type { SlipScore, LegScore } from "@/lib/slip-optimizer-engine";

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

/* ─── Slip Score Card ─── */
function SlipScoreCard({ score }: { score: SlipScore }) {
  const gradeColor = score.score >= 80 ? "text-cosmic-green" : score.score >= 65 ? "text-cosmic-gold" : score.score >= 50 ? "text-cosmic-cyan" : "text-cosmic-red";
  const riskColor = score.riskLevel === "Low" ? "text-cosmic-green" : score.riskLevel === "Moderate" ? "text-cosmic-gold" : "text-cosmic-red";

  return (
    <div className="p-3 rounded-xl bg-secondary/20 border border-border space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn("h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center")}>
            <span className={cn("text-lg font-black", gradeColor)}>{score.grade}</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-xl font-black tabular-nums", gradeColor)}>{score.score}</span>
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
            <p className="text-[9px] text-muted-foreground">{score.confidenceLabel} · {score.legCount} legs</p>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[9px]", riskColor)}>
          {score.riskLevel} Risk
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-1.5 rounded-lg bg-secondary/40">
          <p className="text-[9px] text-muted-foreground">Avg Edge</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{score.avgEdge.toFixed(1)}%</p>
        </div>
        <div className="text-center p-1.5 rounded-lg bg-secondary/40">
          <p className="text-[9px] text-muted-foreground">Avg Conf</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{score.avgConfidence.toFixed(0)}%</p>
        </div>
        <div className="text-center p-1.5 rounded-lg bg-secondary/40">
          <p className="text-[9px] text-muted-foreground">Avg Vol</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{score.avgVolatility.toFixed(0)}%</p>
        </div>
      </div>

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

/* ─── Leg Analysis Card ─── */
function LegAnalysisCard({ leg, rank }: { leg: LegScore; rank: "strongest" | "weakest" | "neutral" }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = leg.score >= 75 ? "text-cosmic-green" : leg.score >= 55 ? "text-cosmic-gold" : "text-cosmic-red";

  return (
    <div className={cn("rounded-lg border transition-all",
      rank === "strongest" ? "border-cosmic-green/30 bg-cosmic-green/5" :
      rank === "weakest" ? "border-cosmic-red/30 bg-cosmic-red/5" :
      "border-border bg-secondary/20"
    )}>
      <button onClick={() => setExpanded(!expanded)} className="w-full p-2 flex items-center justify-between text-left">
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
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border/30 pt-2">
          <p className="text-[9px] text-muted-foreground italic">{leg.rationale}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Edge" value={`${leg.edge.toFixed(1)}%`} good={leg.edge >= 5} />
            <Stat label="Probability" value={`${leg.probability.toFixed(0)}%`} good={leg.probability >= 55} />
            <Stat label="Confidence" value={`${leg.confidence.toFixed(0)}%`} good={leg.confidence >= 60} />
            <Stat label="Volatility" value={`${leg.volatility.toFixed(0)}%`} good={leg.volatility <= 35} />
            <Stat label="Matchup" value={`${leg.matchup_quality.toFixed(0)}`} good={leg.matchup_quality >= 60} />
            <Stat label="Score" value={`${leg.score}/100`} good={leg.score >= 70} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between px-1.5 py-1 rounded bg-secondary/40">
      <span className="text-[8px] text-muted-foreground">{label}</span>
      <span className={cn("text-[9px] font-bold tabular-nums", good ? "text-cosmic-green" : "text-muted-foreground")}>{value}</span>
    </div>
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

/* ─── Hedge Watch Card ─── */
function HedgeWatchCard({ score, picks }: { score: SlipScore; picks: any[] }) {
  const livePicks = picks.filter(p => p.live_value != null && !p.result);
  if (livePicks.length === 0) return null;

  const atRiskLegs = score.legs.filter(l => l.score < 50 || l.flags.includes("high_volatility"));
  if (atRiskLegs.length === 0) return null;

  return (
    <div className="p-2.5 rounded-lg bg-cosmic-gold/5 border border-cosmic-gold/20 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-cosmic-gold" />
        <p className="text-[10px] font-semibold text-cosmic-gold">Hedge Watch</p>
        <Badge variant="outline" className="text-[7px] border-cosmic-gold/30 text-cosmic-gold ml-auto">Advisory</Badge>
      </div>
      {atRiskLegs.map(leg => (
        <div key={leg.id} className="text-[9px] text-muted-foreground">
          <span className="text-cosmic-gold font-semibold">{leg.player_name_raw}</span>
          {" — "}score {leg.score}/100, {leg.volatility.toFixed(0)}% volatility.
          {leg.flags.includes("thin_edge") && " Thin edge detected."}
        </div>
      ))}
      <p className="text-[8px] text-muted-foreground italic">Hedge Watch monitors live risk — advisory only, no action assumed.</p>
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

  if (!picks || picks.length === 0) return null;

  const isPlaced = intentState === "already_placed";
  const isThinking = intentState === "thinking";
  const isBuilding = intentState === "building";
  const isTracking = intentState === "tracking_only";

  const handleAction = (action: string) => {
    onAction?.(action);
    runAiAction(action);
  };

  return (
    <div className="space-y-3 pt-2">
      {/* Slip Score */}
      <SlipScoreCard score={slipScore} />

      {/* Leg Analysis */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Target className="h-3 w-3" /> Leg Analysis
        </p>
        {slipScore.legs.map((leg, idx) => (
          <LegAnalysisCard
            key={leg.id}
            leg={leg}
            rank={idx === slipScore.strongestLegIdx ? "strongest" : idx === slipScore.weakestLegIdx ? "weakest" : "neutral"}
          />
        ))}
      </div>

      {/* Confidence Distribution */}
      <ConfidenceDistribution legs={slipScore.legs} />

      {/* Hedge Watch (placed/live slips) */}
      {(isPlaced || isTracking) && <HedgeWatchCard score={slipScore} picks={picks} />}

      {/* Intent-specific action buttons */}
      {isPlaced && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={TrendingUp} label="Track Live" onClick={() => handleAction("track_live")} />
            <ActionBtn icon={BarChart3} label="Evaluate" onClick={() => handleAction("evaluate")} />
            <ActionBtn icon={Save} label="Save Template" onClick={() => onAction?.("save_template")} />
            <ActionBtn icon={Shield} label="Hedge Ideas" onClick={() => handleAction("hedge_ideas")} />
          </div>
          {/* Rebuild suggestions */}
          <button
            onClick={() => handleAction("rebuild_suggestions")}
            className="w-full p-2.5 rounded-lg bg-cosmic-cyan/5 border border-cosmic-cyan/20 text-left hover:bg-cosmic-cyan/10 transition-colors"
          >
            <p className="text-[10px] font-semibold text-cosmic-cyan flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> What I'd Change Next Time
            </p>
            <p className="text-[8px] text-muted-foreground mt-0.5">
              Tap to generate future rebuild suggestions. Advisory only.
            </p>
          </button>
        </div>
      )}

      {isThinking && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={Zap} label="Optimize Slip" primary onClick={() => handleAction("optimize")} />
            <ActionBtn icon={ArrowUpDown} label="Replace Weakest" onClick={() => handleAction("replace_weakest")} />
            <ActionBtn icon={Shield} label="Reduce Risk" onClick={() => handleAction("reduce_risk")} />
            <ActionBtn icon={Rocket} label="Increase Upside" onClick={() => handleAction("increase_upside")} />
          </div>
          <ActionBtn icon={RefreshCw} label="Compare Better Version" full onClick={() => handleAction("compare_better")} />
        </div>
      )}

      {isBuilding && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon={Zap} label="Optimize" primary onClick={() => handleAction("optimize")} />
            <ActionBtn icon={ArrowUpDown} label="Swap Leg" onClick={() => handleAction("replace_weakest")} />
            <ActionBtn icon={RefreshCw} label="Compare Versions" onClick={() => handleAction("compare_versions")} />
            <ActionBtn icon={Save} label="Save Version" onClick={() => onAction?.("save_version")} />
          </div>
        </div>
      )}

      {isTracking && (
        <div className="grid grid-cols-2 gap-1.5">
          <ActionBtn icon={TrendingUp} label="Track Live" onClick={() => handleAction("track_live")} />
          <ActionBtn icon={BarChart3} label="Grade Slip" onClick={() => handleAction("evaluate")} />
        </div>
      )}

      {/* AI Analysis output */}
      <AiAnalysisPanel analysis={aiAnalysis} loading={aiLoading} action={lastAction} />

      {/* Summary */}
      <div className="p-2 rounded-lg bg-secondary/20 border border-border">
        <div className="flex items-start gap-1.5">
          <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[9px] text-muted-foreground">{slipScore.summary}</p>
        </div>
      </div>
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
