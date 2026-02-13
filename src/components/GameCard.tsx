import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Game } from "@/lib/mock-data";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function GameCard({ game }: { game: Game }) {
  const navigate = useNavigate();
  const isLive = game.status === "live";
  const isFinal = game.status === "final";

  return (
    <button
      onClick={() => navigate(`/game/${game.id}`)}
      className="w-full text-left cosmic-card rounded-xl p-4 transition-all duration-200 hover:border-primary/30 hover:cosmic-glow active:scale-[0.98]"
    >
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cosmic-green animate-pulse-glow" />
              <span className="text-xs font-semibold text-cosmic-green uppercase tracking-wider">Live</span>
            </span>
          )}
          {isFinal && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Final</span>
          )}
          {!isLive && !isFinal && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(game.startTime), "h:mm a")}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground tracking-wide">{game.venue}</span>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        {/* Away */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-8">{game.awayAbbr}</span>
            <span className={cn("text-sm font-medium", isFinal && game.awayScore! > game.homeScore! && "text-foreground", isFinal && game.awayScore! <= game.homeScore! && "text-muted-foreground")}>
              {game.awayTeam}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isFinal && game.awayScore! > game.homeScore! ? "text-foreground" : "text-muted-foreground")}>
                {game.awayScore}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
              {formatOdds(game.odds.moneyline.away)}
            </span>
          </div>
        </div>

        {/* Home */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-8">{game.homeAbbr}</span>
            <span className={cn("text-sm font-medium", isFinal && game.homeScore! > game.awayScore! && "text-foreground", isFinal && game.homeScore! <= game.awayScore! && "text-muted-foreground")}>
              {game.homeTeam}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isFinal && game.homeScore! > game.awayScore! ? "text-foreground" : "text-muted-foreground")}>
                {game.homeScore}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
              {formatOdds(game.odds.moneyline.home)}
            </span>
          </div>
        </div>
      </div>

      {/* Spread & Total */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
        <div className="flex-1 text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
          <p className="text-xs font-medium text-foreground tabular-nums">
            {game.odds.spread.line > 0 ? "+" : ""}{game.odds.spread.line}
          </p>
        </div>
        <div className="w-px h-6 bg-border/50" />
        <div className="flex-1 text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
          <p className="text-xs font-medium text-foreground tabular-nums">
            O/U {game.odds.total.line}
          </p>
        </div>
      </div>
    </button>
  );
}
