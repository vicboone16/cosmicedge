import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function PeriodScoresTicker({ gameId, league, isLive }: { gameId: string; league: string; isLive: boolean }) {
  const { data: quarters } = useQuery({
    queryKey: ["game-quarters", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_quarters")
        .select("quarter, home_score, away_score")
        .eq("game_id", gameId)
        .order("quarter", { ascending: true });
      return data || [];
    },
    staleTime: isLive ? 15_000 : 5 * 60_000,
    refetchInterval: isLive ? 15_000 : false,
  });

  if (!quarters?.length) return null;

  const periodLabel = league === "NHL" ? "P" : league === "MLB" ? "" : "Q";

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {quarters.map((q) => (
        <div key={q.quarter} className="flex flex-col items-center min-w-[28px]">
          <span className="text-[8px] text-muted-foreground uppercase">
            {periodLabel}{q.quarter}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {q.away_score ?? "-"}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-foreground">
            {q.home_score ?? "-"}
          </span>
        </div>
      ))}
    </div>
  );
}
