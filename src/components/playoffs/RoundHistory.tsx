/**
 * #10 — Round-by-Round History
 * Expandable completed rounds with cosmic accuracy recap.
 * Shows which element type dominated, prediction accuracy per series.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Trophy, Target, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlayoffSeries } from "@/hooks/use-playoff-series";
import { cn } from "@/lib/utils";

interface Props {
  series: PlayoffSeries[];
  league: string;
}

const ELEMENT_COLORS: Record<string, string> = {
  Fire: "text-orange-400",
  Earth: "text-emerald-400",
  Air: "text-violet-400",
  Water: "text-cyan-400",
};

function RoundSection({ round, roundSeries, astroMap, predictionAccuracy }: {
  round: string;
  roundSeries: PlayoffSeries[];
  astroMap: Map<string, { element: string | null }>;
  predictionAccuracy: Map<string, { correct: number; total: number }>;
}) {
  const [expanded, setExpanded] = useState(false);

  // Calculate element stats for winners
  const elementWins: Record<string, number> = {};
  let totalSweeps = 0;
  let totalGames7 = 0;

  for (const s of roundSeries) {
    if (!s.isComplete || !s.winner) continue;
    const winnerAstro = astroMap.get(s.winner);
    if (winnerAstro?.element) {
      elementWins[winnerAstro.element] = (elementWins[winnerAstro.element] || 0) + 1;
    }
    const maxWins = Math.max(s.teamA.wins, s.teamB.wins);
    const minWins = Math.min(s.teamA.wins, s.teamB.wins);
    if (minWins === 0) totalSweeps++;
    if (maxWins === 4 && minWins === 3) totalGames7++;
  }

  const dominantElement = Object.entries(elementWins).sort((a, b) => b[1] - a[1])[0];
  const completedCount = roundSeries.filter((s) => s.isComplete).length;

  if (completedCount === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/20 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-cosmic-gold" />
          <span className="text-xs font-semibold text-foreground">{round}</span>
          <span className="text-[10px] text-muted-foreground">
            · {completedCount} series
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dominantElement && (
            <span className={cn("text-[10px] font-semibold", ELEMENT_COLORS[dominantElement[0]] || "text-foreground")}>
              {dominantElement[0]} dominance
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Element summary */}
          <div className="flex items-center gap-4 flex-wrap">
            {Object.entries(elementWins).map(([el, count]) => (
              <div key={el} className="flex items-center gap-1.5">
                <div className={cn("h-2 w-2 rounded-full",
                  el === "Fire" && "bg-orange-400",
                  el === "Earth" && "bg-emerald-400",
                  el === "Air" && "bg-violet-400",
                  el === "Water" && "bg-cyan-400",
                )} />
                <span className="text-[10px] text-muted-foreground">
                  {el}: <span className="font-semibold text-foreground">{count}W</span>
                </span>
              </div>
            ))}
            {totalSweeps > 0 && (
              <span className="text-[10px] text-cosmic-gold">
                🧹 {totalSweeps} sweep{totalSweeps > 1 ? "s" : ""}
              </span>
            )}
            {totalGames7 > 0 && (
              <span className="text-[10px] text-cosmic-red">
                🔥 {totalGames7} Game 7{totalGames7 > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Individual series results */}
          {roundSeries.filter((s) => s.isComplete).map((s) => {
            const winnerIsA = s.winner === s.teamA.abbr;
            const loserAbbr = winnerIsA ? s.teamB.abbr : s.teamA.abbr;
            const winnerAstro = astroMap.get(s.winner || "");
            const accuracy = predictionAccuracy.get(s.key);

            return (
              <div
                key={s.key}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-background/30 border border-border/20"
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-bold",
                    ELEMENT_COLORS[winnerAstro?.element || ""] || "text-foreground",
                  )}>
                    {s.winner}
                  </span>
                  <span className="text-[10px] text-muted-foreground">def.</span>
                  <span className="text-xs text-muted-foreground">{loserAbbr}</span>
                  <span className="text-[10px] font-mono text-foreground/70">
                    ({Math.max(s.teamA.wins, s.teamB.wins)}-{Math.min(s.teamA.wins, s.teamB.wins)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {winnerAstro?.element && (
                    <span className={cn("text-[9px]", ELEMENT_COLORS[winnerAstro.element])}>
                      {winnerAstro.element}
                    </span>
                  )}
                  {accuracy && accuracy.total > 0 && (
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <Target className="h-2.5 w-2.5" />
                      {Math.round((accuracy.correct / accuracy.total) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Cosmic insight */}
          {dominantElement && (
            <div className="flex items-start gap-2 pt-2 border-t border-border/20">
              <Sparkles className="h-3 w-3 text-cosmic-lavender mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                {dominantElement[0]} signs dominated {round.toLowerCase()} — {" "}
                {dominantElement[0] === "Fire" && "aggressive, high-energy teams controlled pace and imposed their will."}
                {dominantElement[0] === "Earth" && "disciplined, defensive-minded teams ground opponents into submission."}
                {dominantElement[0] === "Air" && "versatile, cerebral teams won through superior game-planning and adjustment."}
                {dominantElement[0] === "Water" && "emotionally-driven teams rode momentum and crowd energy to victory."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RoundHistory({ series, league }: Props) {
  const completedSeries = series.filter((s) => s.isComplete);

  // Fetch team_astro for element data
  const allAbbrs = [...new Set(series.flatMap((s) => [s.teamA.abbr, s.teamB.abbr]))];

  const { data: astroMap } = useQuery({
    queryKey: ["round-history-astro", league, allAbbrs.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_astro")
        .select("team_abbr, element")
        .in("team_abbr", allAbbrs);
      const map = new Map<string, { element: string | null }>();
      for (const d of data || []) {
        map.set(d.team_abbr, { element: d.element });
      }
      return map;
    },
    enabled: allAbbrs.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch prediction accuracy per series
  const completedGameIds = completedSeries.flatMap((s) =>
    s.games.filter((g) => g.status === "final").map((g) => g.id)
  );

  const { data: predictionAccuracy } = useQuery({
    queryKey: ["round-history-accuracy", completedGameIds.sort().join(",")],
    queryFn: async () => {
      if (!completedGameIds.length) return new Map<string, { correct: number; total: number }>();

      const { data: predictions } = await supabase
        .from("ce_game_predictions")
        .select("game_id, edge_home, edge_away")
        .in("game_id", completedGameIds);

      if (!predictions?.length) return new Map<string, { correct: number; total: number }>();

      // Build accuracy per series
      const accMap = new Map<string, { correct: number; total: number }>();

      for (const s of completedSeries) {
        let correct = 0;
        let total = 0;

        for (const g of s.games) {
          if (g.status !== "final") continue;
          const pred = predictions.find((p) => p.game_id === g.id);
          if (!pred) continue;

          total++;
          const predictedHome = (pred.edge_home ?? 0) > (pred.edge_away ?? 0);
          const actualHomeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
          if (predictedHome === actualHomeWon) correct++;
        }

        accMap.set(s.key, { correct, total });
      }

      return accMap;
    },
    enabled: completedGameIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  if (!completedSeries.length || !astroMap) return null;

  // Group completed series by round
  const roundMap = new Map<string, PlayoffSeries[]>();
  for (const s of completedSeries) {
    const arr = roundMap.get(s.round) || [];
    arr.push(s);
    roundMap.set(s.round, arr);
  }

  // Order rounds: First Round → Second Round → Conference Finals → Finals
  const roundOrder = ["First Round", "Second Round", "Conference Finals", "Finals"];
  const orderedRounds = [...roundMap.entries()].sort(
    (a, b) => roundOrder.indexOf(a[0]) - roundOrder.indexOf(b[0])
  );

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-cosmic-cyan" />
        Round History & Cosmic Accuracy
      </h2>

      <div className="space-y-2">
        {orderedRounds.map(([round, ss]) => (
          <RoundSection
            key={round}
            round={round}
            roundSeries={ss}
            astroMap={astroMap}
            predictionAccuracy={predictionAccuracy || new Map()}
          />
        ))}
      </div>
    </section>
  );
}
