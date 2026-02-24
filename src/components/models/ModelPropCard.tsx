import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ModelOverlayRow } from "./ModelOverlayRow";
import { ModelDetailsDrawer } from "./ModelDetailsDrawer";
import type { NebulaOverlay, SelectedModel } from "@/hooks/use-nebula-overlay";

interface Props {
  overlay: NebulaOverlay;
  selectedModel: SelectedModel;
  isAdmin: boolean;
  onPlayerClick?: (playerId: string) => void;
}

const PROP_LABELS: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK",
  threes: "3PM", pts_reb_ast: "PRA", pts_reb: "P+R", pts_ast: "P+A", reb_ast: "R+A",
  turnovers: "TOV", fantasy_score: "FPTS",
};

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function ModelPropCard({ overlay, selectedModel, isAdmin, onPlayerClick }: Props) {
  const propLabel = PROP_LABELS[overlay.prop_type] || overlay.prop_type.replace(/_/g, " ");
  const isOver = overlay.side === "over" || overlay.side == null;

  return (
    <div className="cosmic-card rounded-xl p-3 space-y-2">
      {/* Player header */}
      <div className="flex items-center gap-2">
        <button onClick={() => onPlayerClick?.(overlay.player_id)} className="shrink-0">
          <Avatar className="h-8 w-8">
            {overlay.headshot_url && <AvatarImage src={overlay.headshot_url} alt={overlay.player_name || ""} />}
            <AvatarFallback className="text-[10px] bg-secondary">
              {(overlay.player_name || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onPlayerClick?.(overlay.player_id)}
            className="text-xs font-semibold text-foreground hover:text-primary truncate block"
          >
            {overlay.player_name}
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{overlay.player_team}</span>
            {overlay.home_abbr && overlay.away_abbr && (
              <>
                <span>·</span>
                <span>{overlay.away_abbr} @ {overlay.home_abbr}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Prop line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">{propLabel}</span>
          <span className="text-sm font-bold tabular-nums">{overlay.line != null ? Number(overlay.line) : "—"}</span>
          {overlay.edge_score_v11 != null && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-primary/30">
                    EV v1.1
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs">
                  EV-based EdgeScore (uses mu/sigma vs line + implied odds).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex items-center gap-0.5 text-xs font-semibold",
            isOver ? "text-cosmic-green" : "text-cosmic-red"
          )}>
            {isOver ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isOver ? "Over" : "Under"}
          </span>
          <span className="text-xs font-bold tabular-nums text-foreground">{formatOdds(overlay.odds)}</span>
        </div>
      </div>

      {/* Model overlay row */}
      <ModelOverlayRow overlay={overlay} selectedModel={selectedModel} />

      {/* Details drawer */}
      <ModelDetailsDrawer overlay={overlay} isAdmin={isAdmin} />
    </div>
  );
}
