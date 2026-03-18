import { useState } from "react";
import { X, Brain, TrendingUp, BarChart3, Zap, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LegScore } from "@/lib/slip-optimizer-engine";

interface Props {
  leg: LegScore;
  pick: any;
  onClose: () => void;
  isAdmin?: boolean;
}

function StatRow({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-secondary/30">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn("text-[10px] font-bold tabular-nums",
        neutral ? "text-foreground" :
        good ? "text-cosmic-green" : "text-cosmic-red"
      )}>{value}</span>
    </div>
  );
}

export function SlipLegDetailDrawer({ leg, pick, onClose, isAdmin }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black",
              leg.score >= 75 ? "bg-cosmic-green/15 text-cosmic-green" :
              leg.score >= 55 ? "bg-cosmic-gold/15 text-cosmic-gold" :
              "bg-cosmic-red/15 text-cosmic-red"
            )}>
              {leg.grade}
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{leg.player_name_raw}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {leg.stat_type} · {leg.direction} {leg.line}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        {/* Score */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-border">
          <div className="text-center">
            <p className={cn("text-2xl font-black tabular-nums",
              leg.score >= 75 ? "text-cosmic-green" : leg.score >= 55 ? "text-cosmic-gold" : "text-cosmic-red"
            )}>{leg.score}</p>
            <p className="text-[8px] text-muted-foreground">/ 100</p>
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-foreground italic">{leg.rationale}</p>
            <div className="flex gap-1 flex-wrap">
              {leg.isSynthetic && <Badge variant="outline" className="text-[7px] text-cosmic-cyan border-cosmic-cyan/30">Imported Prop</Badge>}
              {leg.flags.map(f => (
                <Badge key={f} variant="outline" className="text-[7px] text-cosmic-gold border-cosmic-gold/30">{f.replace(/_/g, " ")}</Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Factor Grid */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Scoring Factors
          </p>
          <div className="grid grid-cols-2 gap-1">
            <StatRow label="Edge" value={`${leg.edge.toFixed(1)}%`} good={leg.edge >= 5} />
            <StatRow label="Probability" value={`${leg.probability.toFixed(0)}%`} good={leg.probability >= 55} />
            <StatRow label="Confidence" value={`${leg.confidence.toFixed(0)}%`} good={leg.confidence >= 60} />
            <StatRow label="Volatility" value={`${leg.volatility.toFixed(0)}%`} good={leg.volatility <= 35} />
            <StatRow label="Matchup Quality" value={`${leg.matchup_quality.toFixed(0)}`} good={leg.matchup_quality >= 60} />
            <StatRow label="Leg Score" value={`${leg.score}/100`} good={leg.score >= 70} />
          </div>
        </div>

        {/* Live Progress */}
        {pick.live_value != null && (
          <div className="p-2.5 rounded-lg bg-secondary/20 border border-border">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Live Progress</p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tabular-nums text-foreground">{Number(pick.live_value)}</span>
              <span className="text-[10px] text-muted-foreground">/ {pick.line} ({pick.direction})</span>
            </div>
            <div className="h-2.5 bg-secondary/50 rounded-full overflow-hidden mt-1.5">
              <div
                className={cn("h-full rounded-full transition-all",
                  Number(pick.live_value) >= pick.line ? "bg-cosmic-green" : "bg-primary"
                )}
                style={{ width: `${Math.min((Number(pick.live_value) / Number(pick.line)) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Match Status */}
        <div className="p-2.5 rounded-lg bg-secondary/20 border border-border space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground">Match Status</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[8px] capitalize">{pick.match_status?.replace(/_/g, " ") || "unknown"}</Badge>
          </div>
        </div>

        {/* Admin: Raw Data */}
        {isAdmin && (
          <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-[10px] font-semibold text-destructive mb-1 flex items-center gap-1">
              <Brain className="h-3 w-3" /> Admin Debug
            </p>
            <div className="grid grid-cols-2 gap-1 text-[8px] font-mono text-muted-foreground">
              <span>id: {leg.id.slice(0, 8)}</span>
              <span>synthetic: {String(leg.isSynthetic)}</span>
              <span>edge_raw: {leg.edge}</span>
              <span>prob_raw: {leg.probability}</span>
              <span>conf_raw: {leg.confidence}</span>
              <span>vol_raw: {leg.volatility}</span>
              <span>matchup_raw: {leg.matchup_quality}</span>
              <span>flags: {leg.flags.join(", ") || "none"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
