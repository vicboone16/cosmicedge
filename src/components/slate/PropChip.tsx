import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertTriangle, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";

export interface LivePropContext {
  current_value?: number | null;
  projected_final?: number | null;
  pace_pct?: number | null;
  hit_probability?: number | null;
  live_edge?: number | null;
  foul_risk_level?: string | null;
  foul_count?: number | null;
  blowout_probability?: number | null;
  minutes_security_score?: number | null;
  game_quarter?: number | null;
  game_clock?: string | null;
  status_label?: string | null;
}

interface PropChipProps {
  prop: TopProp;
  size?: "compact" | "medium" | "full";
  liveContext?: LivePropContext | null;
  onClick?: () => void;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

const SIGNAL_BADGES: Record<string, { label: string; className: string }> = {
  momentum: { label: "Momentum", className: "bg-primary/10 text-primary" },
  over_heater: { label: "Over Heater", className: "bg-cosmic-green/10 text-cosmic-green" },
  usage_spike: { label: "Usage Spike", className: "bg-yellow-500/10 text-yellow-500" },
  defense_edge: { label: "Defense Edge", className: "bg-blue-400/10 text-blue-400" },
  jupiter_lift: { label: "Jupiter Lift", className: "bg-cosmic-gold/10 text-cosmic-gold" },
  live_rising: { label: "Live Rising", className: "bg-cosmic-green/10 text-cosmic-green" },
};

function getSignals(prop: TopProp): string[] {
  const signals: string[] = [];
  if (prop.streak != null && prop.streak >= 4) signals.push("over_heater");
  if (prop.hit_l10 != null && prop.hit_l10 >= 0.7) signals.push("momentum");
  if (signals.length === 0 && (prop.edge_score_v11 ?? prop.edge_score) >= 65) signals.push("defense_edge");
  return signals.slice(0, 2);
}

function getFoulRiskColor(level: string | null | undefined): string {
  if (!level) return "";
  const l = level.toLowerCase();
  if (l === "extreme" || l === "severe") return "text-cosmic-red";
  if (l === "high") return "text-orange-400";
  if (l === "caution") return "text-yellow-500";
  return "text-muted-foreground";
}

function formatPlayerName(name: string | undefined | null): string {
  if (!name) return "—";
  // Return full name, but abbreviate first name if very long
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  // e.g. "LeBron James" stays, "Giannis Antetokounmpo" → "G. Antetokounmpo" if too long
  const full = parts.join(" ");
  if (full.length <= 16) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

export function PropChip({ prop, size = "compact", liveContext, onClick }: PropChipProps) {
  const { openProp } = usePropDrawer();
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const signals = getSignals(prop);
  const propLabel = getPropLabel(prop.prop_type);
  const lc = liveContext;
  const isLive = lc && lc.current_value != null;

  const handleClick = () => {
    if (onClick) onClick();
    else openProp(prop);
  };

  if (size === "compact") {
    return (
      <button
        onClick={handleClick}
        className="shrink-0 cosmic-card rounded-xl p-2.5 w-[160px] space-y-1 text-left hover:border-primary/30 transition-colors"
      >
        {/* Header: name + edge score */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-foreground truncate max-w-[100px]">
            {formatPlayerName(prop.player_name)}
          </span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-bold", tier.className)}>
            {edgeScore.toFixed(0)}
          </Badge>
        </div>

        {/* Stat type + line */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-xs font-bold tabular-nums">{prop.line != null ? Number(prop.line) : "—"}</span>
        </div>

        {/* Live progress bar or projection */}
        {isLive ? (
          <div className="space-y-0.5">
            {/* Current / Line progress */}
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-foreground font-semibold tabular-nums">
                Now: {lc.current_value}
              </span>
              <span className="text-muted-foreground tabular-nums">
                Proj: {lc.projected_final?.toFixed(1) ?? "—"}
              </span>
            </div>
            {/* Mini progress bar */}
            {prop.line != null && prop.line > 0 && (
              <div className="relative h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "absolute left-0 top-0 h-full rounded-full transition-all",
                    (lc.current_value ?? 0) >= prop.line ? "bg-cosmic-green" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(((lc.current_value ?? 0) / prop.line) * 100, 100)}%` }}
                />
                {lc.projected_final != null && (
                  <div
                    className="absolute top-0 h-full w-px bg-foreground/40"
                    style={{ left: `${Math.min((lc.projected_final / prop.line) * 100, 100)}%` }}
                  />
                )}
              </div>
            )}
            {/* Pace % + Hit prob */}
            <div className="flex items-center justify-between text-[8px]">
              {lc.pace_pct != null && (
                <span className={cn(
                  "font-semibold tabular-nums",
                  lc.pace_pct >= 100 ? "text-cosmic-green" : lc.pace_pct >= 80 ? "text-yellow-500" : "text-cosmic-red"
                )}>
                  Pace {lc.pace_pct.toFixed(0)}%
                </span>
              )}
              {lc.hit_probability != null && (
                <span className="text-muted-foreground tabular-nums">
                  Hit {(lc.hit_probability * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[9px] font-semibold flex items-center gap-0.5",
              isOver ? "text-cosmic-green" : "text-cosmic-red"
            )}>
              {isOver ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {isOver ? "O" : "U"} {prop.mu?.toFixed(1)}
            </span>
            <span className="text-[9px] text-muted-foreground tabular-nums">{formatOdds(prop.odds)}</span>
          </div>
        )}

        {/* Risk indicators (live) */}
        {isLive && (lc.foul_risk_level || lc.blowout_probability != null && (lc.blowout_probability ?? 0) > 0.3) ? (
          <div className="flex gap-1 flex-wrap">
            {lc.foul_risk_level && lc.foul_risk_level !== "none" && (
              <span className={cn("text-[7px] px-1 py-0 rounded-full font-semibold flex items-center gap-0.5", getFoulRiskColor(lc.foul_risk_level))}>
                <AlertTriangle className="h-2 w-2" />
                {lc.foul_count ?? ""}F {lc.foul_risk_level}
              </span>
            )}
            {(lc.blowout_probability ?? 0) > 0.3 && (
              <span className="text-[7px] px-1 py-0 rounded-full font-semibold text-orange-400">
                Blowout {((lc.blowout_probability ?? 0) * 100).toFixed(0)}%
              </span>
            )}
            {lc.minutes_security_score != null && lc.minutes_security_score < 50 && (
              <span className="text-[7px] px-1 py-0 rounded-full font-semibold text-yellow-500 flex items-center gap-0.5">
                <Shield className="h-2 w-2" /> Min Risk
              </span>
            )}
          </div>
        ) : (
          signals.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {signals.map(s => {
                const badge = SIGNAL_BADGES[s];
                return badge ? (
                  <span key={s} className={cn("text-[7px] px-1 py-0 rounded-full font-semibold", badge.className)}>
                    {badge.label}
                  </span>
                ) : null;
              })}
            </div>
          )
        )}

        {/* Live edge badge */}
        {isLive && lc.live_edge != null && (
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[7px] font-bold tabular-nums",
              lc.live_edge > 0 ? "text-cosmic-green" : "text-cosmic-red"
            )}>
              Edge {lc.live_edge > 0 ? "+" : ""}{lc.live_edge.toFixed(1)}%
            </span>
          </div>
        )}
      </button>
    );
  }

  // medium / full size
  return (
    <button
      onClick={handleClick}
      className={cn(
        "cosmic-card rounded-xl p-3 space-y-2 text-left hover:border-primary/30 transition-colors",
        size === "full" ? "w-full" : "w-[200px] shrink-0"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-foreground truncate block">
            {prop.player_name}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {prop.player_team}
            {prop.home_abbr && prop.away_abbr && ` · ${prop.away_abbr} @ ${prop.home_abbr}`}
          </span>
        </div>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold", tier.className)}>
          {edgeScore.toFixed(0)} {tier.label}
        </Badge>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-sm font-bold tabular-nums">{prop.line != null ? Number(prop.line) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">→ {prop.mu?.toFixed(1)}</span>
        </div>
        <span className={cn(
          "text-xs font-semibold flex items-center gap-0.5",
          isOver ? "text-cosmic-green" : "text-cosmic-red"
        )}>
          {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isOver ? "Over" : "Under"}
          <span className="text-muted-foreground ml-1 tabular-nums">{formatOdds(prop.odds)}</span>
        </span>
      </div>

      {/* Live context for medium/full */}
      {isLive && (
        <div className="space-y-1 border-t border-border/30 pt-1.5">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-foreground font-semibold tabular-nums">
              Current: {lc.current_value} → Proj: {lc.projected_final?.toFixed(1) ?? "—"}
            </span>
            {lc.pace_pct != null && (
              <span className={cn(
                "font-semibold tabular-nums",
                lc.pace_pct >= 100 ? "text-cosmic-green" : lc.pace_pct >= 80 ? "text-yellow-500" : "text-cosmic-red"
              )}>
                Pace {lc.pace_pct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap text-[8px]">
            {lc.hit_probability != null && (
              <span className="text-muted-foreground">Hit {(lc.hit_probability * 100).toFixed(0)}%</span>
            )}
            {lc.live_edge != null && (
              <span className={lc.live_edge > 0 ? "text-cosmic-green" : "text-cosmic-red"}>
                Edge {lc.live_edge > 0 ? "+" : ""}{lc.live_edge.toFixed(1)}%
              </span>
            )}
            {lc.foul_risk_level && lc.foul_risk_level !== "none" && (
              <span className={getFoulRiskColor(lc.foul_risk_level)}>
                {lc.foul_count ?? ""}F {lc.foul_risk_level}
              </span>
            )}
            {(lc.blowout_probability ?? 0) > 0.3 && (
              <span className="text-orange-400">Blowout {((lc.blowout_probability ?? 0) * 100).toFixed(0)}%</span>
            )}
          </div>
        </div>
      )}

      {!isLive && prop.one_liner && (
        <p className="text-[10px] text-muted-foreground italic leading-relaxed">{prop.one_liner}</p>
      )}
      {signals.length > 0 && !isLive && (
        <div className="flex gap-1 flex-wrap">
          {signals.map(s => {
            const badge = SIGNAL_BADGES[s];
            return badge ? (
              <span key={s} className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-semibold", badge.className)}>
                {badge.label}
              </span>
            ) : null;
          })}
        </div>
      )}
    </button>
  );
}
