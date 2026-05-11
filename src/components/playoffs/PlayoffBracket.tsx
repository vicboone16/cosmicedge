/**
 * #8 — Playoff Bracket + Series Tracker
 * Visual bracket showing all matchups in the current round at a glance.
 * Tapping a series card scrolls to/navigates to its games.
 */
import { Trophy, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlayoffSeries } from "@/hooks/use-playoff-series";
import { cn } from "@/lib/utils";

interface Props {
  series: PlayoffSeries[];
  league: string;
}

function SeriesCard({ s, onClick }: { s: PlayoffSeries; onClick: () => void }) {
  const leading = s.teamA.wins > s.teamB.wins ? "A" : s.teamB.wins > s.teamA.wins ? "B" : "tied";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-shrink-0 w-[200px] rounded-xl border p-3 transition-all duration-200",
        "hover:scale-[1.02] active:scale-[0.98]",
        s.isComplete
          ? "bg-secondary/20 border-border/30 opacity-70"
          : "cosmic-card border-border/40 hover:border-primary/30",
      )}
    >
      {/* Round label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
          {s.round}
        </span>
        {s.isComplete && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-cosmic-green bg-cosmic-green/10 px-1.5 py-0.5 rounded-full">
            Final
          </span>
        )}
      </div>

      {/* Team A */}
      <div className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded-lg mb-1",
        leading === "A" ? "bg-primary/8" : "bg-transparent",
      )}>
        <div className="flex items-center gap-2">
          {s.teamA.seed && (
            <span className="text-[9px] font-mono text-muted-foreground w-3 text-right">{s.teamA.seed}</span>
          )}
          <span className={cn(
            "text-xs font-semibold",
            leading === "A" ? "text-foreground" : "text-muted-foreground",
            s.winner === s.teamA.abbr && "text-cosmic-green",
          )}>
            {s.teamA.abbr}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i < s.teamA.wins
                  ? s.winner === s.teamA.abbr ? "bg-cosmic-green" : "bg-primary"
                  : "bg-border/40",
              )}
            />
          ))}
          <span className="text-xs font-bold ml-1 w-3 text-right">{s.teamA.wins}</span>
        </div>
      </div>

      {/* Team B */}
      <div className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded-lg",
        leading === "B" ? "bg-primary/8" : "bg-transparent",
      )}>
        <div className="flex items-center gap-2">
          {s.teamB.seed && (
            <span className="text-[9px] font-mono text-muted-foreground w-3 text-right">{s.teamB.seed}</span>
          )}
          <span className={cn(
            "text-xs font-semibold",
            leading === "B" ? "text-foreground" : "text-muted-foreground",
            s.winner === s.teamB.abbr && "text-cosmic-green",
          )}>
            {s.teamB.abbr}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i < s.teamB.wins
                  ? s.winner === s.teamB.abbr ? "bg-cosmic-green" : "bg-primary"
                  : "bg-border/40",
              )}
            />
          ))}
          <span className="text-xs font-bold ml-1 w-3 text-right">{s.teamB.wins}</span>
        </div>
      </div>

      {/* Game number / status */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground">
          {s.isComplete
            ? `${s.winner} wins ${Math.max(s.teamA.wins, s.teamB.wins)}-${Math.min(s.teamA.wins, s.teamB.wins)}`
            : `Game ${s.gameNumber}`}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </div>
    </button>
  );
}

export function PlayoffBracket({ series, league }: Props) {
  const navigate = useNavigate();

  if (!series.length) return null;

  // Group by round
  const rounds = new Map<string, PlayoffSeries[]>();
  for (const s of series) {
    const arr = rounds.get(s.round) || [];
    arr.push(s);
    rounds.set(s.round, arr);
  }

  // Get active round (first round with incomplete series)
  const activeRound = [...rounds.entries()].find(([_, ss]) => ss.some((s) => !s.isComplete))?.[0]
    || [...rounds.keys()].pop()
    || "";

  const activeSeries = rounds.get(activeRound) || series;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-cosmic-gold" />
          {league} Bracket — {activeRound}
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {activeSeries.filter((s) => !s.isComplete).length} active
        </span>
      </div>

      <div
        className="flex gap-3 overflow-x-auto no-scrollbar pb-1"
        style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
      >
        {activeSeries.map((s) => (
          <SeriesCard
            key={s.key}
            s={s}
            onClick={() => {
              // Navigate to the next upcoming game in this series
              const nextGame = s.games.find((g) => g.status === "scheduled");
              if (nextGame) navigate(`/game/${nextGame.id}`);
              else if (s.games.length) navigate(`/game/${s.games[s.games.length - 1].id}`);
            }}
          />
        ))}
      </div>

      {/* Completed rounds summary */}
      {[...rounds.entries()]
        .filter(([round]) => round !== activeRound)
        .map(([round, ss]) => (
          <div key={round} className="mt-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{round}</p>
            <div className="flex flex-wrap gap-2">
              {ss.map((s) => (
                <span
                  key={s.key}
                  className="text-[10px] text-muted-foreground bg-secondary/30 rounded-lg px-2 py-1"
                >
                  {s.winner || "?"} def. {s.winner === s.teamA.abbr ? s.teamB.abbr : s.teamA.abbr}{" "}
                  ({Math.max(s.teamA.wins, s.teamB.wins)}-{Math.min(s.teamA.wins, s.teamB.wins)})
                </span>
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}
