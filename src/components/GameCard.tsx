import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { GameWithOdds } from "@/hooks/use-games";
import { useTimezone } from "@/hooks/use-timezone";
import { getPlanetaryHourAt } from "@/lib/planetary-hours";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PeriodScoresTicker } from "@/components/game/PeriodScoresTicker";
import { useOracle } from "@/hooks/use-oracle";
import { QuickPropsRail } from "@/components/slate/QuickPropsRail";

function formatOdds(odds: number | null): string {
  if (odds == null || odds === 0) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

const LiveSnapshot = memo(function LiveSnapshot({ gameId }: { gameId: string }) {
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
});

export const GameCard = memo(function GameCard({ game }: { game: GameWithOdds }) {
  const navigate = useNavigate();
  const { formatInUserTZ, getTZAbbrev } = useTimezone();
  const isLive = game.status === "live" || game.status === "in_progress";
  const isFinal = game.status === "final";
  const hasStarted = new Date(game.start_time) <= new Date();
  const hasScores = game.status !== "scheduled" && game.home_score != null && game.away_score != null && hasStarted && (game.home_score > 0 || game.away_score > 0);

  const { pregame } = useOracle(
    game.id,
    game.home_abbr,
    game.away_abbr,
    game.league,
    game.odds.moneyline.home || undefined,
    game.odds.moneyline.away || undefined,
  );

  // Memoize planetary hour computation
  const planetaryHour = useMemo(() => {
    const gameStartDate = new Date(game.start_time);
    return getPlanetaryHourAt(gameStartDate);
  }, [game.start_time]);

  const elemental = useMemo(() => ({
    label: `${planetaryHour?.symbol || "☉"} ${planetaryHour?.planet || "Solar"}`,
    color: "text-cosmic-gold",
  }), [planetaryHour]);

  const handleTeamClick = useCallback((e: React.MouseEvent, abbr: string) => {
    e.stopPropagation();
    navigate(`/team/${game.league}/${abbr}`);
  }, [navigate, game.league]);

  const handleGameClick = useCallback(() => {
    navigate(`/game/${game.id}`);
  }, [navigate, game.id]);

  return (
    <button
      onClick={handleGameClick}
      className={cn(
        "w-full text-left cosmic-card rounded-xl p-4 transition-all duration-200 hover:border-primary/30 hover:cosmic-glow active:scale-[0.98]",
        isLive && "border-l-2 border-l-cosmic-green"
      )}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
            game.league === "NBA" ? "bg-orange-500/15 text-orange-400" :
            game.league === "NHL" ? "bg-blue-500/15 text-blue-400" :
            game.league === "NFL" ? "bg-green-500/15 text-green-400" :
            game.league === "MLB" ? "bg-red-500/15 text-red-400" :
            game.league === "NCAAB" ? "bg-purple-500/15 text-purple-400" :
            "bg-secondary text-muted-foreground"
          )}>
            {game.league}
          </span>
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

      {/* Oracle Prediction Strip */}
      {pregame && !isFinal && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-cosmic-indigo font-semibold uppercase tracking-wider">✦ Oracle</span>
              <span className="text-[10px] font-bold text-foreground tabular-nums">
                {pregame.muAway} – {pregame.muHome}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[9px] font-bold tabular-nums",
                pregame.pHomeWin > 0.55 ? "text-cosmic-green" : pregame.pHomeWin < 0.45 ? "text-destructive" : "text-muted-foreground"
              )}>
                {game.home_abbr} {(pregame.pHomeWin * 100).toFixed(0)}%
              </span>
              {pregame.edgeHome != null && Math.abs(pregame.edgeHome) > 0.01 && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-bold",
                  pregame.edgeHome > 0.03 ? "bg-cosmic-green/20 text-cosmic-green" :
                  pregame.edgeHome < -0.03 ? "bg-destructive/20 text-destructive" :
                  "bg-secondary text-muted-foreground"
                )}>
                  {pregame.edgeHome > 0 ? "+" : ""}{(pregame.edgeHome * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edge Tier Badge */}
      {pregame && !isFinal && pregame.edgeHome != null && (
        (() => {
          const absEdge = Math.abs(pregame.edgeHome);
          const pct = (absEdge * 100);
          if (pct < 3) return null;
          const tier = pct >= 8 ? "Elite" : pct >= 5 ? "Strong" : "Playable";
          const tierColor = tier === "Elite" ? "bg-cosmic-green/15 text-cosmic-green border-cosmic-green/30" 
            : tier === "Strong" ? "bg-cosmic-gold/15 text-cosmic-gold border-cosmic-gold/30" 
            : "bg-primary/10 text-primary border-primary/20";
          return (
            <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2">
              <span className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", tierColor)}>
                {tier} Edge
              </span>
              <span className="text-[10px] text-muted-foreground">
                {pregame.edgeHome > 0 ? game.home_abbr : game.away_abbr} +{pct.toFixed(1)}%
              </span>
            </div>
          );
        })()
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

      {/* Quick Props Rail */}
      <QuickPropsRail gameId={game.id} isLive={isLive} />
    </button>
  );
});
