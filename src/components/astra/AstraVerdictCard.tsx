import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown,
  Shield, Target, Zap, Eye, HelpCircle,
} from "lucide-react";

export interface AstraVerdict {
  id: string;
  decision_label: string;
  decision_score: number | null;
  confidence_grade: string | null;
  risk_grade: string | null;
  hit_probability: number | null;
  expected_value: number | null;
  projected_value: number | null;
  line_value: number | null;
  direction: string | null;
  market_type: string | null;
  primary_reason: string | null;
  secondary_reason: string | null;
  warning_note: string | null;
  recommendation: string | null;
  reasoning: string | null;
  answer_summary: string | null;
  query_text: string | null;
  created_at: string;
}

const DECISION_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  strong_yes: { color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", icon: CheckCircle2, label: "Strong Yes" },
  yes_playable: { color: "text-green-400 bg-green-500/15 border-green-500/30", icon: CheckCircle2, label: "Playable" },
  lean_yes: { color: "text-lime-400 bg-lime-500/15 border-lime-500/30", icon: TrendingUp, label: "Lean Yes" },
  neutral: { color: "text-muted-foreground bg-muted/50 border-border/50", icon: HelpCircle, label: "Neutral" },
  lean_no: { color: "text-amber-400 bg-amber-500/15 border-amber-500/30", icon: TrendingDown, label: "Lean No" },
  pass: { color: "text-orange-400 bg-orange-500/15 border-orange-500/30", icon: XCircle, label: "Pass" },
  high_risk: { color: "text-red-400 bg-red-500/15 border-red-500/30", icon: AlertTriangle, label: "High Risk" },
  trap_watch: { color: "text-red-500 bg-red-500/20 border-red-500/40", icon: Eye, label: "Trap Watch" },
  better_alternative_available: { color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30", icon: Target, label: "Better Alt" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  elite: "text-emerald-400",
  high: "text-green-400",
  medium: "text-amber-400",
  cautious: "text-orange-400",
  fragile: "text-red-400",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-emerald-400",
  moderate: "text-amber-400",
  elevated: "text-orange-400",
  high: "text-red-400",
  extreme: "text-red-500",
};

export default function AstraVerdictCard({ verdict, compact }: { verdict: AstraVerdict; compact?: boolean }) {
  const cfg = DECISION_CONFIG[verdict.decision_label] || DECISION_CONFIG.neutral;
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "rounded-xl border backdrop-blur-sm space-y-3 transition-all",
      cfg.color,
      compact ? "p-3" : "p-4"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <span className={cn("font-bold uppercase tracking-wider", compact ? "text-xs" : "text-sm")}>
            {cfg.label}
          </span>
          {verdict.decision_score != null && (
            <span className="text-[10px] font-mono opacity-70">
              ({verdict.decision_score.toFixed(0)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {verdict.confidence_grade && (
            <span className={cn("text-[9px] font-bold uppercase", CONFIDENCE_COLORS[verdict.confidence_grade] || "text-muted-foreground")}>
              {verdict.confidence_grade}
            </span>
          )}
          {verdict.risk_grade && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded-full border border-current/20 font-bold uppercase",
              RISK_COLORS[verdict.risk_grade] || "text-muted-foreground"
            )}>
              <Shield className="h-2.5 w-2.5 inline mr-0.5" />
              {verdict.risk_grade}
            </span>
          )}
        </div>
      </div>

      {/* Stats Row */}
      {(verdict.hit_probability != null || verdict.expected_value != null || verdict.projected_value != null) && (
        <div className="flex items-center gap-4 text-[11px]">
          {verdict.hit_probability != null && (
            <div className="text-center">
              <div className="font-bold tabular-nums text-foreground">{(verdict.hit_probability * 100).toFixed(0)}%</div>
              <div className="text-[8px] text-muted-foreground uppercase">Hit Prob</div>
            </div>
          )}
          {verdict.expected_value != null && (
            <div className="text-center">
              <div className={cn("font-bold tabular-nums", verdict.expected_value > 0 ? "text-emerald-400" : "text-red-400")}>
                {verdict.expected_value > 0 ? "+" : ""}{(verdict.expected_value * 100).toFixed(1)}%
              </div>
              <div className="text-[8px] text-muted-foreground uppercase">EV</div>
            </div>
          )}
          {verdict.projected_value != null && verdict.line_value != null && (
            <div className="text-center">
              <div className="font-bold tabular-nums text-foreground">
                {verdict.projected_value.toFixed(1)}
                <span className="text-muted-foreground font-normal"> / {verdict.line_value}</span>
              </div>
              <div className="text-[8px] text-muted-foreground uppercase">Proj / Line</div>
            </div>
          )}
          {verdict.direction && verdict.market_type && (
            <div className="text-center ml-auto">
              <div className="font-semibold text-foreground capitalize">{verdict.direction}</div>
              <div className="text-[8px] text-muted-foreground">{verdict.market_type.replace(/_/g, " ")}</div>
            </div>
          )}
        </div>
      )}

      {/* Reasoning */}
      {!compact && verdict.answer_summary && (
        <p className="text-xs leading-relaxed text-foreground/85">{verdict.answer_summary}</p>
      )}

      {/* Primary + Secondary reasons */}
      {verdict.primary_reason && (
        <div className="flex items-start gap-2 text-[11px]">
          <Zap className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
          <span className="text-foreground/80">{verdict.primary_reason}</span>
        </div>
      )}
      {!compact && verdict.secondary_reason && (
        <div className="flex items-start gap-2 text-[11px]">
          <Target className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
          <span className="text-foreground/60">{verdict.secondary_reason}</span>
        </div>
      )}

      {/* Warning */}
      {verdict.warning_note && (
        <div className="flex items-start gap-2 text-[10px] rounded-lg bg-destructive/10 border border-destructive/20 p-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 text-destructive flex-shrink-0" />
          <span className="text-destructive/90">{verdict.warning_note}</span>
        </div>
      )}
    </div>
  );
}
