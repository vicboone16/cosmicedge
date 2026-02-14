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

async function fetchGamesFromDB(date?: Date): Promise<GameWithOdds[]> {
  // Use ET (Eastern Time) date boundaries — US sports schedules are ET-based.
  // Games stored in UTC; a 10 PM ET game = 2-3 AM UTC next day.
  // We query from 4 AM UTC (midnight ET during EDT) to 28 hours later
  // to capture all games for the ET calendar date.
  const target = date || new Date();
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();

  // ET offset: EDT (Mar-Nov) = UTC-4, EST (Nov-Mar) = UTC-5
  const etOffset = (m >= 2 && m <= 10) ? 4 : 5;

  // Midnight ET in UTC = date + etOffset hours
  const startOfDay = new Date(Date.UTC(y, m, d, etOffset, 0, 0, 0));
  // End of ET day = next midnight ET
  const endOfDay = new Date(Date.UTC(y, m, d, etOffset + 24, 0, 0, 0));

  // Fetch games from database for the local day
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

async function refreshOddsAndFetch(date?: Date): Promise<GameWithOdds[]> {
  // Only refresh odds for today
  const isToday = !date || date.toDateString() === new Date().toDateString();
  if (isToday) {
    try {
      const { error: fnError } = await supabase.functions.invoke("fetch-odds", {
        body: null,
      });
      if (fnError) console.warn("Odds refresh error (non-blocking):", fnError);
    } catch (e) {
      console.warn("Odds refresh failed (non-blocking):", e);
    }
  }

  return fetchGamesFromDB(date);
}

export function useGames(league?: string, date?: Date) {
  return useQuery({
    queryKey: ["games", league, date?.toDateString()],
    queryFn: () => refreshOddsAndFetch(date),
    staleTime: 5 * 60 * 1000,
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
