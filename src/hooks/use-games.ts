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

async function fetchGamesFromDB(): Promise<GameWithOdds[]> {
  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Fetch today's games from database
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .gte("start_time", startOfDay.toISOString())
    .lte("start_time", endOfDay.toISOString())
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

    // Get the most recent snapshot per market type
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

async function refreshOddsAndFetch(): Promise<GameWithOdds[]> {
  // Try to refresh odds via edge function (fire & forget style, don't block on failure)
  try {
    const { error: fnError } = await supabase.functions.invoke("fetch-odds", {
      body: null,
    });
    if (fnError) console.warn("Odds refresh error (non-blocking):", fnError);
  } catch (e) {
    console.warn("Odds refresh failed (non-blocking):", e);
  }

  // Always read from DB
  return fetchGamesFromDB();
}

export function useGames(league?: string) {
  return useQuery({
    queryKey: ["games", league],
    queryFn: refreshOddsAndFetch,
    staleTime: 5 * 60 * 1000,
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
