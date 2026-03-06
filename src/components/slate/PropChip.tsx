import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";

interface PropChipProps {
  prop: TopProp;
  size?: "compact" | "medium" | "full";
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

export function PropChip({ prop, size = "compact", onClick }: PropChipProps) {
  const { openProp } = usePropDrawer();
  const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
  const tier = getEdgeTier(edgeScore);
  const isOver = prop.side === "over" || prop.side == null;
  const signals = getSignals(prop);
  const propLabel = getPropLabel(prop.prop_type);

  const handleClick = () => {
    if (onClick) onClick();
    else openProp(prop);
  };

  if (size === "compact") {
    return (
      <button
        onClick={onClick}
        className="shrink-0 cosmic-card rounded-xl p-2.5 w-[140px] space-y-1.5 text-left hover:border-primary/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-foreground truncate max-w-[80px]">
            {prop.player_name?.split(" ").pop()}
          </span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-bold", tier.className)}>
            {edgeScore.toFixed(0)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-xs font-bold tabular-nums">{prop.line != null ? Number(prop.line) : "—"}</span>
        </div>
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
        {signals.length > 0 && (
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
        )}
      </button>
    );
  }

  // medium / full size
  return (
    <button
      onClick={onClick}
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
      {prop.one_liner && (
        <p className="text-[10px] text-muted-foreground italic leading-relaxed">{prop.one_liner}</p>
      )}
      {signals.length > 0 && (
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
