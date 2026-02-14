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

/**
 * Get UTC offset in hours for an IANA timezone on a given date.
 * Uses Intl to handle DST automatically.
 */
function getTimezoneOffsetHours(tz: string, refDate: Date): number {
  // Build a formatter that outputs the UTC offset for this tz
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset", // e.g. "GMT-7", "GMT+5:30"
    });
    const parts = formatter.formatToParts(refDate);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
    // Parse "GMT-7", "GMT+5:30", "GMT" etc.
    const match = tzPart.match(/GMT([+-]?)(\d+)?(?::(\d+))?/);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const hrs = parseInt(match[2] || "0", 10);
    const mins = parseInt(match[3] || "0", 10);
    return sign * (hrs + mins / 60);
  } catch {
    return 0; // fallback to UTC
  }
}

async function fetchGamesFromDB(date?: Date, userTimezone?: string): Promise<GameWithOdds[]> {
  const target = date || new Date();
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();

  // Use the user's timezone to determine day boundaries in UTC.
  // E.g. Pacific (UTC-7 in summer): midnight PT = 07:00 UTC
  const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetHours = getTimezoneOffsetHours(tz, target);
  // Midnight in user's TZ = UTC midnight minus offset
  // offset is +X for east, -X for west. Midnight local = 00:00 - offset = -offset UTC
  const startOfDay = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // Fetch games from database for the user's local day
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("*")
    .gte("start_time", startOfDay.toISOString())
    .lt("start_time", endOfDay.toISOString())
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

async function refreshOddsAndFetch(date?: Date, userTimezone?: string): Promise<GameWithOdds[]> {
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

  return fetchGamesFromDB(date, userTimezone);
}

export function useGames(league?: string, date?: Date, userTimezone?: string) {
  return useQuery({
    queryKey: ["games", league, date?.toDateString(), userTimezone],
    queryFn: () => refreshOddsAndFetch(date, userTimezone),
    staleTime: 5 * 60 * 1000,
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
