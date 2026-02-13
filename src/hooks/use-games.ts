import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type GameRow = Tables<"games">;
export type OddsSnapshotRow = Tables<"odds_snapshots">;

export interface GameWithOdds extends GameRow {
  odds: {
    moneyline: { home: number; away: number };
    spread: { home: number; away: number; line: number };
    total: { over: number; under: number; line: number };
  };
}

async function fetchAndRefreshOdds(): Promise<GameWithOdds[]> {
  // Call the edge function to fetch fresh odds
  const { data: fnData, error: fnError } = await supabase.functions.invoke("fetch-odds", {
    body: null,
  });

  if (fnError) {
    console.warn("Edge function error, falling back to DB:", fnError);
  }

  if (fnData?.games?.length) {
    return fnData.games;
  }

  // Fallback: read from database
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .order("start_time", { ascending: true });

  if (gamesError) throw gamesError;
  if (!games?.length) return [];

  // Get latest odds for each game
  const gameIds = games.map((g) => g.id);
  const { data: odds } = await supabase
    .from("odds_snapshots")
    .select("*")
    .in("game_id", gameIds)
    .order("captured_at", { ascending: false });

  return games.map((game) => {
    const gameOdds = odds?.filter((o) => o.game_id === game.id) || [];

    const ml = gameOdds.find((o) => o.market_type === "moneyline");
    const spread = gameOdds.find((o) => o.market_type === "spread");
    const total = gameOdds.find((o) => o.market_type === "total");

    return {
      ...game,
      odds: {
        moneyline: { home: ml?.home_price || 0, away: ml?.away_price || 0 },
        spread: {
          home: spread?.home_price || -110,
          away: spread?.away_price || -110,
          line: spread?.line || 0,
        },
        total: {
          over: total?.home_price || -110,
          under: total?.away_price || -110,
          line: total?.line || 0,
        },
      },
    };
  });
}

export function useGames(league?: string) {
  return useQuery({
    queryKey: ["games", league],
    queryFn: fetchAndRefreshOdds,
    staleTime: 5 * 60 * 1000, // 5 min
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
