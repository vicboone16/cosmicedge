import { useState } from "react";
import { CheckCircle, Eye, Zap, BarChart3, ArrowUpDown, TrendingUp, TrendingDown, Shield, Rocket, RefreshCw, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type SlipIntent = "already_placed" | "thinking" | "building" | "tracking_only";

export const INTENT_CONFIG: Record<SlipIntent, { label: string; description: string; icon: any; color: string }> = {
  already_placed: { label: "Already Placed", description: "Advisory & tracking mode", icon: CheckCircle, color: "text-cosmic-green" },
  thinking: { label: "Thinking About Placing", description: "Full optimizer mode", icon: Eye, color: "text-cosmic-gold" },
  building: { label: "Building / Comparing", description: "Editable experiment mode", icon: Zap, color: "text-cosmic-cyan" },
  tracking_only: { label: "Tracking Only", description: "Monitor & grade", icon: BarChart3, color: "text-muted-foreground" },
};

/* ─── Intent Selector (shown on import or on slip open) ─── */
export function SlipIntentSelector({
  value,
  onChange,
  compact = false,
}: {
  value: SlipIntent;
  onChange: (v: SlipIntent) => void;
  compact?: boolean;
}) {
  const intents = Object.entries(INTENT_CONFIG) as [SlipIntent, typeof INTENT_CONFIG[SlipIntent]][];

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        {intents.map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold transition-colors border",
                value === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
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
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                "flex flex-col items-start gap-1 p-2.5 rounded-lg border transition-all text-left",
                value === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", value === key ? "text-primary" : cfg.color)} />
                <span className={cn("text-[11px] font-semibold", value === key ? "text-foreground" : "text-muted-foreground")}>
                  {cfg.label}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground">{cfg.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Slip Optimizer Panel ─── */
interface SlipOptimizerProps {
  slip: any;
  picks: any[];
  intentState: SlipIntent;
  onAction?: (action: string) => void;
}

function LegGrade({ pick, rank }: { pick: any; rank: "strongest" | "weakest" | "neutral" }) {
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5 px-2 rounded-lg",
      rank === "strongest" ? "bg-cosmic-green/10" :
      rank === "weakest" ? "bg-cosmic-red/10" :
      "bg-secondary/30"
    )}>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground truncate">{pick.player_name_raw}</p>
        <p className="text-[9px] text-muted-foreground capitalize">{pick.stat_type} · {pick.direction} {Number(pick.line)}</p>
      </div>
      <Badge variant="outline" className={cn(
        "text-[8px] shrink-0",
        rank === "strongest" ? "border-cosmic-green/30 text-cosmic-green" :
        rank === "weakest" ? "border-cosmic-red/30 text-cosmic-red" :
        "text-muted-foreground"
      )}>
        {rank === "strongest" ? "Strongest" : rank === "weakest" ? "Weakest" : "—"}
      </Badge>
    </div>
  );
}

export function SlipOptimizerPanel({ slip, picks, intentState, onAction }: SlipOptimizerProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  if (!picks || picks.length === 0) return null;

  // Mock grading — in production this would call the engine
  const mockGrade = () => {
    const grades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
    return grades[Math.floor(Math.random() * 3)]; // Bias toward good grades
  };

  const strongestIdx = 0; // First pick as placeholder
  const weakestIdx = picks.length - 1; // Last pick as placeholder

  const isPlaced = intentState === "already_placed";
  const isTracking = intentState === "tracking_only";
  const isThinking = intentState === "thinking";
  const isBuilding = intentState === "building";
  const canOptimize = isThinking || isBuilding;

  return (
    <div className="space-y-3 pt-2">
      {/* Slip Grade */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{mockGrade()}</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-foreground">Slip Grade</p>
            <p className="text-[9px] text-muted-foreground">{picks.length} legs · {slip.entry_type}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn(
          "text-[9px]",
          isPlaced ? "border-cosmic-green/30 text-cosmic-green" :
          isThinking ? "border-cosmic-gold/30 text-cosmic-gold" :
          isBuilding ? "border-cosmic-cyan/30 text-cosmic-cyan" :
          "text-muted-foreground"
        )}>
          {INTENT_CONFIG[intentState].label}
        </Badge>
      </div>

      {/* Leg Grades */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Leg Analysis</p>
        {picks.map((pick: any, idx: number) => (
          <LegGrade
            key={pick.id || idx}
            pick={pick}
            rank={idx === strongestIdx ? "strongest" : idx === weakestIdx ? "weakest" : "neutral"}
          />
        ))}
      </div>

      {/* Confidence Distribution */}
      <div className="p-2.5 rounded-lg bg-secondary/30 border border-border">
        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Confidence Distribution</p>
        <div className="flex gap-1 h-6">
          {picks.map((_: any, i: number) => {
            const conf = 50 + Math.random() * 40;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  conf >= 80 ? "bg-cosmic-green" :
                  conf >= 60 ? "bg-cosmic-gold" :
                  "bg-cosmic-red"
                )}
                style={{ height: `${conf}%` }}
                title={`Leg ${i + 1}: ${conf.toFixed(0)}%`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[8px] text-muted-foreground">Weakest</span>
          <span className="text-[8px] text-muted-foreground">Strongest</span>
        </div>
      </div>

      {/* Intent-specific actions */}
      {isPlaced && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("track_live")}>
              <TrendingUp className="h-3 w-3" /> Track Live
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("evaluate")}>
              <BarChart3 className="h-3 w-3" /> Evaluate
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("save_template")}>
              <Save className="h-3 w-3" /> Save Template
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("hedge_ideas")}>
              <Shield className="h-3 w-3" /> Hedge Ideas
            </Button>
          </div>

          {/* "If rebuilt" advisory section */}
          <div className="p-2.5 rounded-lg bg-cosmic-cyan/5 border border-cosmic-cyan/20">
            <p className="text-[10px] font-semibold text-cosmic-cyan mb-1">If Rebuilt, I Would Change...</p>
            <p className="text-[9px] text-muted-foreground italic">
              Tap "Evaluate" to generate rebuild suggestions based on current data.
              These are advisory only — your placed slip is locked.
            </p>
          </div>
        </div>
      )}

      {isThinking && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("optimize")}>
              <Zap className="h-3 w-3" /> Optimize Slip
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("replace_weakest")}>
              <ArrowUpDown className="h-3 w-3" /> Replace Weakest
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("reduce_risk")}>
              <Shield className="h-3 w-3" /> Reduce Risk
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("increase_upside")}>
              <Rocket className="h-3 w-3" /> Increase Upside
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full text-[10px] h-8 gap-1" onClick={() => onAction?.("compare_better")}>
            <RefreshCw className="h-3 w-3" /> Compare Better Version
          </Button>
        </div>
      )}

      {isBuilding && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("optimize")}>
              <Zap className="h-3 w-3" /> Optimize
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("replace_weakest")}>
              <ArrowUpDown className="h-3 w-3" /> Swap Leg
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("compare_versions")}>
              <RefreshCw className="h-3 w-3" /> Compare Versions
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("save_version")}>
              <Save className="h-3 w-3" /> Save Version
            </Button>
          </div>
        </div>
      )}

      {isTracking && (
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("track_live")}>
            <TrendingUp className="h-3 w-3" /> Track Live
          </Button>
          <Button variant="outline" size="sm" className="text-[10px] h-8 gap-1" onClick={() => onAction?.("evaluate")}>
            <BarChart3 className="h-3 w-3" /> Grade Slip
          </Button>
        </div>
      )}
    </div>
  );
}
