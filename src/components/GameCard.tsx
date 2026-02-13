import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { GameWithOdds } from "@/hooks/use-games";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function GameCard({ game }: { game: GameWithOdds }) {
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
              {format(new Date(game.start_time), "h:mm a")}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground tracking-wide">{game.venue || game.league}</span>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-8">{game.away_abbr}</span>
            <span className={cn("text-sm font-medium", isFinal && (game.away_score ?? 0) > (game.home_score ?? 0) && "text-foreground", isFinal && (game.away_score ?? 0) <= (game.home_score ?? 0) && "text-muted-foreground")}>
              {game.away_team}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isFinal && (game.away_score ?? 0) > (game.home_score ?? 0) ? "text-foreground" : "text-muted-foreground")}>
                {game.away_score}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
              {formatOdds(game.odds.moneyline.away)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground w-8">{game.home_abbr}</span>
            <span className={cn("text-sm font-medium", isFinal && (game.home_score ?? 0) > (game.away_score ?? 0) && "text-foreground", isFinal && (game.home_score ?? 0) <= (game.away_score ?? 0) && "text-muted-foreground")}>
              {game.home_team}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isFinal && (game.home_score ?? 0) > (game.away_score ?? 0) ? "text-foreground" : "text-muted-foreground")}>
                {game.home_score}
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
            {game.odds.spread.line ? `${game.odds.spread.line > 0 ? "+" : ""}${game.odds.spread.line}` : "—"}
          </p>
        </div>
        <div className="w-px h-6 bg-border/50" />
        <div className="flex-1 text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
          <p className="text-xs font-medium text-foreground tabular-nums">
            {game.odds.total.line ? `O/U ${game.odds.total.line}` : "—"}
          </p>
        </div>
      </div>
    </button>
  );
}
