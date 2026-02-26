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
 */
function getTimezoneOffsetHours(tz: string, refDate: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(refDate);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const match = tzPart.match(/GMT([+-]?)(\d+)?(?::(\d+))?/);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const hrs = parseInt(match[2] || "0", 10);
    const mins = parseInt(match[3] || "0", 10);
    return sign * (hrs + mins / 60);
  } catch {
    return 0;
  }
}

// Debounce odds refresh — only one in-flight at a time
let _oddsRefreshPromise: Promise<void> | null = null;
let _lastOddsRefresh = 0;
const ODDS_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

async function maybeRefreshOdds() {
  const now = Date.now();
  if (now - _lastOddsRefresh < ODDS_REFRESH_INTERVAL) return;
  if (_oddsRefreshPromise) return; // already in-flight
  
  _lastOddsRefresh = now;
  _oddsRefreshPromise = supabase.functions.invoke("fetch-odds", { body: null })
    .then(() => {})
    .catch((e) => console.warn("Odds refresh failed (non-blocking):", e))
    .finally(() => { _oddsRefreshPromise = null; });
}

async function fetchGamesFromDB(date?: Date, userTimezone?: string): Promise<GameWithOdds[]> {
  const target = date || new Date();
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();

  const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetHours = getTimezoneOffsetHours(tz, target);
  const startOfDay = new Date(Date.UTC(y, m, d, -offsetHours, 0, 0, 0));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // Odds refresh is handled by backend cron jobs to avoid SGO rate limits.
  // Do NOT call maybeRefreshOdds() from the frontend.

  // Fetch games with only required columns
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, league, home_team, away_team, home_abbr, away_abbr, home_score, away_score, start_time, status, venue, venue_lat, venue_lng, external_id")
    .gte("start_time", startOfDay.toISOString())
    .lt("start_time", endOfDay.toISOString())
    .order("start_time", { ascending: true })
    .limit(500);

  if (gamesError) throw gamesError;
  if (!games?.length) return [];

  // Get latest odds — fetch only required columns
  const gameIds = games.map((g) => g.id);
  const { data: odds } = await supabase
    .from("odds_snapshots")
    .select("game_id, market_type, home_price, away_price, line, captured_at")
    .in("game_id", gameIds)
    .order("captured_at", { ascending: false })
    .limit(5000);

  // Group odds by game_id for O(1) lookup instead of O(n) filter per game
  const oddsByGame = new Map<string, typeof odds>();
  odds?.forEach((o) => {
    if (!oddsByGame.has(o.game_id)) oddsByGame.set(o.game_id, []);
    oddsByGame.get(o.game_id)!.push(o);
  });

  return games.map((game) => {
    const gameOdds = oddsByGame.get(game.id) || [];
    const ml = gameOdds.find((o) => o.market_type === "moneyline");
    const spread = gameOdds.find((o) => o.market_type === "spread");
    const total = gameOdds.find((o) => o.market_type === "total");

    return {
      ...game,
      source: "manual" as const,
      created_at: "",
      updated_at: "",
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

export function useGames(league?: string, date?: Date, userTimezone?: string) {
  return useQuery({
    queryKey: ["games", date?.toDateString(), userTimezone],
    queryFn: () => fetchGamesFromDB(date, userTimezone),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const games = query.state.data;
      const hasLive = games?.some((g) => g.status === "live");
      return hasLive ? 30_000 : false;
    },
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
