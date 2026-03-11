import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { getPropLabel, getEdgeTier, type TopProp } from "@/hooks/use-top-props";
import { MiniPropDetail } from "@/components/props/MiniPropDetail";

/** Normalized prop shape used by the carousel */
export interface CarouselProp {
  id: string;
  player_name: string;
  player_id: string;
  player_team?: string;
  headshot_url?: string | null;
  prop_type: string;
  line: number | null;
  over_odds: number | null;
  under_odds: number | null;
  vendor?: string;
  game_id?: string;
  // Model enrichment (optional)
  mu?: number;
  sigma?: number;
  edge_score?: number;
  edge_score_v11?: number | null;
  side?: string | null;
  hit_l10?: number | null;
  streak?: number | null;
  confidence_tier?: string | null;
  one_liner?: string | null;
  home_abbr?: string;
  away_abbr?: string;
}

/** Sort order for prop types */
const PROP_ORDER = [
  "points", "rebounds", "assists", "pts_reb_ast", "threes",
  "steals", "blocks", "pts_reb", "pts_ast", "reb_ast",
  "turnovers", "fantasy_score",
  // BDL / market keys
  "player_points", "player_rebounds", "player_assists",
  "player_points_rebounds_assists", "player_threes",
  "player_steals", "player_blocks", "player_turnovers",
  "player_points_rebounds", "player_points_assists",
  "player_rebounds_assists", "player_blocks_steals",
];

function sortProps(props: CarouselProp[]): CarouselProp[] {
  return [...props].sort((a, b) => {
    const ai = PROP_ORDER.indexOf(a.prop_type);
    const bi = PROP_ORDER.indexOf(b.prop_type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

interface PlayerPropCarouselProps {
  playerName: string;
  playerId?: string;
  headshot_url?: string | null;
  team?: string;
  props: CarouselProp[];
  gameId?: string;
  onPlayerClick?: (playerId: string, playerName: string) => void;
  onAddToSkySpread?: (prop: CarouselProp) => void;
}

export function PlayerPropCarousel({
  playerName,
  playerId,
  headshot_url,
  team,
  props,
  gameId,
  onPlayerClick,
  onAddToSkySpread,
}: PlayerPropCarouselProps) {
  const [selectedProp, setSelectedProp] = useState<CarouselProp | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const sorted = sortProps(props);

  const isResolved = !playerName.startsWith("Player ") && !playerName.startsWith("Unknown") && !/^\d+$/.test(playerName);

  const handlePropTap = useCallback((prop: CarouselProp) => {
    setSelectedProp(prop);
    setDetailOpen(true);
  }, []);

  const handleAdd = useCallback((e: React.MouseEvent, prop: CarouselProp) => {
    e.stopPropagation();
    onAddToSkySpread?.(prop);
  }, [onAddToSkySpread]);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {/* Player name header */}
      <button
        onClick={() => isResolved && playerId && onPlayerClick?.(playerId, playerName)}
        className={cn(
          "text-xs font-semibold truncate block px-1",
          isResolved ? "text-primary hover:underline cursor-pointer" : "text-foreground cursor-default"
        )}
      >
        {playerName}
        {team && <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">{team}</span>}
      </button>

      {/* Horizontal swipe rail */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {sorted.map((prop) => {
          const propLabel = getPropLabel(prop.prop_type);
          const hasModel = prop.mu != null && prop.mu > 0;
          const edgeScore = prop.edge_score_v11 ?? prop.edge_score ?? 0;
          const tier = edgeScore > 0 ? getEdgeTier(edgeScore) : null;
          const isOver = prop.side === "over" || prop.side == null;

          return (
            <button
              key={prop.id}
              onClick={() => handlePropTap(prop)}
              className={cn(
                "shrink-0 cosmic-card rounded-xl p-2.5 w-[120px] space-y-1 text-left",
                "hover:border-primary/30 transition-all active:scale-[0.97]",
                edgeScore >= 70 && "border-cosmic-green/30 shadow-[0_0_8px_-3px] shadow-cosmic-green/20"
              )}
            >
              {/* Prop type + line */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{propLabel}</span>
                {tier && edgeScore >= 55 && (
                  <span className={cn("text-[7px] font-bold px-1 py-0 rounded-full", tier.className)}>
                    {edgeScore.toFixed(0)}
                  </span>
                )}
              </div>

              {/* Line value */}
              <p className="text-base font-bold tabular-nums text-foreground leading-tight">
                {prop.line != null ? prop.line : "—"}
              </p>

              {/* Model projection or odds */}
              {hasModel ? (
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-[10px] font-semibold flex items-center gap-0.5",
                    isOver ? "text-cosmic-green" : "text-cosmic-red"
                  )}>
                    {isOver ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {prop.mu!.toFixed(1)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[9px] tabular-nums">
                  <span className="text-cosmic-green font-semibold">O {formatOdds(prop.over_odds)}</span>
                  <span className="text-cosmic-red font-semibold">U {formatOdds(prop.under_odds)}</span>
                </div>
              )}

              {/* + button */}
              {onAddToSkySpread && (
                <button
                  onClick={(e) => handleAdd(e, prop)}
                  className="w-full mt-0.5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                  title="Add to SkySpread"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </button>
          );
        })}
      </div>

      {/* Mini prop detail drawer */}
      <MiniPropDetail
        prop={selectedProp}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        gameId={gameId}
        onAddToSkySpread={onAddToSkySpread}
      />
    </div>
  );
}
