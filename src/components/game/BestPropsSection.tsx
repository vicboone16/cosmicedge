import { useTopPropsForGame, getPropLabel, getEdgeTier } from "@/hooks/use-top-props";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  gameId: string;
}

export function BestPropsSection({ gameId }: Props) {
  const { data: props } = useTopPropsForGame(gameId, 5);

  if (!props || props.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-primary" />
        Best Props for This Matchup
      </h3>
      <div className="space-y-2">
        {props.map(prop => {
          const edgeScore = prop.edge_score_v11 ?? prop.edge_score;
          const tier = getEdgeTier(edgeScore);
          const isOver = prop.side === "over" || prop.side == null;
          const propLabel = getPropLabel(prop.prop_type);

          return (
            <div key={prop.id} className="cosmic-card rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate block">{prop.player_name}</span>
                  <span className="text-[10px] text-muted-foreground">{prop.player_team}</span>
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
                </span>
              </div>
              {prop.one_liner && (
                <p className="text-[10px] text-muted-foreground italic">{prop.one_liner}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
