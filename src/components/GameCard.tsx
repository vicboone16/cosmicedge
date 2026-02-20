import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { GameWithOdds } from "@/hooks/use-games";
import { useTimezone } from "@/hooks/use-timezone";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PeriodScoresTicker } from "@/components/game/PeriodScoresTicker";

function formatOdds(odds: number): string {
  if (!odds) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function LiveSnapshot({ gameId }: { gameId: string }) {
  const { data: snapshot } = useQuery({
    queryKey: ["game-snapshot", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_state_snapshots")
        .select("quarter, clock, status")
        .eq("game_id", gameId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  if (!snapshot) return null;

  return (
    <span className="text-[10px] text-cosmic-green font-medium tabular-nums">
      {snapshot.quarter && <>{snapshot.quarter}</>}
      {snapshot.clock && snapshot.clock !== snapshot.quarter && <> · {snapshot.clock}</>}
    </span>
  );
}

export function GameCard({ game }: { game: GameWithOdds }) {
  const navigate = useNavigate();
  const { formatInUserTZ, getTZAbbrev } = useTimezone();
  const isLive = game.status === "live";
  const isFinal = game.status === "final";
  const hasScores = game.home_score != null && game.away_score != null;

  // Planetary hour at game start time
  const gameStartDate = new Date(game.start_time);
  const planetaryHour = getPlanetaryHourAt(gameStartDate);
  const elemental = { label: `${planetaryHour?.symbol || "☉"} ${planetaryHour?.planet || "Solar"}`, color: "text-cosmic-gold" };

  const handleTeamClick = (e: React.MouseEvent, abbr: string) => {
    e.stopPropagation();
    navigate(`/team/${game.league}/${abbr}`);
  };

  return (
    <button
      onClick={() => navigate(`/game/${game.id}`)}
      className={cn(
        "w-full text-left cosmic-card rounded-xl p-4 transition-all duration-200 hover:border-primary/30 hover:cosmic-glow active:scale-[0.98]",
        isLive && "border-l-2 border-l-cosmic-green"
      )}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cosmic-green animate-pulse-glow" />
              <span className="text-xs font-semibold text-cosmic-green uppercase tracking-wider">Live</span>
              <LiveSnapshot gameId={game.id} />
            </span>
          )}
          {isFinal && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Final</span>
          )}
          {!isLive && !isFinal && hasScores && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cosmic-green animate-pulse-glow" />
              <span className="text-xs font-semibold text-cosmic-green uppercase tracking-wider">In Progress</span>
            </span>
          )}
          {!isLive && !isFinal && !hasScores && (
            <span className="text-xs text-muted-foreground">
              {formatInUserTZ(game.start_time)} <span className="text-[9px]">{getTZAbbrev()}</span>
            </span>
          )}
        </div>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", elemental.color)}>
          {elemental.label}
        </span>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              onClick={(e) => handleTeamClick(e, game.away_abbr)}
              className="text-xs font-bold text-primary w-8 hover:underline cursor-pointer"
            >
              {game.away_abbr}
            </span>
            <span className={cn("text-sm font-medium", isFinal && (game.away_score ?? 0) > (game.home_score ?? 0) && "text-foreground", isFinal && (game.away_score ?? 0) <= (game.home_score ?? 0) && "text-muted-foreground")}>
              {game.away_team}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal || hasScores) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isLive || (!isFinal && hasScores) ? "text-cosmic-green" : isFinal && (game.away_score ?? 0) > (game.home_score ?? 0) ? "text-foreground" : "text-muted-foreground")}>
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
            <span
              onClick={(e) => handleTeamClick(e, game.home_abbr)}
              className="text-xs font-bold text-primary w-8 hover:underline cursor-pointer"
            >
              {game.home_abbr}
            </span>
            <span className={cn("text-sm font-medium", isFinal && (game.home_score ?? 0) > (game.away_score ?? 0) && "text-foreground", isFinal && (game.home_score ?? 0) <= (game.away_score ?? 0) && "text-muted-foreground")}>
              {game.home_team}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(isLive || isFinal || hasScores) && (
              <span className={cn("text-lg font-bold font-display tabular-nums", isLive || (!isFinal && hasScores) ? "text-cosmic-green" : isFinal && (game.home_score ?? 0) > (game.away_score ?? 0) ? "text-foreground" : "text-muted-foreground")}>
                {game.home_score}
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
              {formatOdds(game.odds.moneyline.home)}
            </span>
          </div>
        </div>
      </div>

      {/* Period Scores Ticker */}
      {(isLive || isFinal || hasScores) && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <PeriodScoresTicker gameId={game.id} league={game.league} isLive={isLive || hasScores} />
        </div>
      )}

      {/* Astro + Spread & Total */}
      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
        <p className="text-[10px] text-cosmic-indigo italic leading-relaxed">
          ✦ {planetaryHour ? `${planetaryHour.symbol} ${planetaryHour.planet} hour at tip-off` : "Planetary hour unavailable"}
        </p>
        <div className="flex items-center gap-3">
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
          <div className="w-px h-6 bg-border/50" />
          <div className="flex-1 text-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Venue</span>
            <p className="text-[10px] font-medium text-foreground truncate">
              {game.venue || "TBD"}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
