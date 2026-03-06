import { useNavigate } from "react-router-dom";
import type { GameWithOdds } from "@/hooks/use-games";
import { cn } from "@/lib/utils";

interface Props {
  games: GameWithOdds[];
}

export function LiveNowStrip({ games }: Props) {
  const navigate = useNavigate();
  if (games.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-cosmic-green uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
        Live Now
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {games.map(g => (
          <button
            key={g.id}
            onClick={() => navigate(`/game/${g.id}`)}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-cosmic-green/10 border border-cosmic-green/20 hover:bg-cosmic-green/20 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cosmic-green animate-pulse-glow" />
            <span className="text-xs font-semibold text-foreground whitespace-nowrap">
              {g.away_abbr} @ {g.home_abbr}
            </span>
            {g.away_score != null && g.home_score != null && (
              <span className="text-[10px] font-bold text-cosmic-green tabular-nums">
                {g.away_score}–{g.home_score}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
