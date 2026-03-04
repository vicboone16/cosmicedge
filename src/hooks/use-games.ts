import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type GameRow = Tables<"games">;
export type OddsSnapshotRow = Tables<"odds_snapshots">;

export interface GameWithOdds extends GameRow {
  odds: {
    moneyline: { home: number | null; away: number | null };
    spread: { home: number | null; away: number | null; line: number | null };
    total: { over: number | null; under: number | null; line: number | null };
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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Debounce odds refresh — only one in-flight at a time
let _oddsRefreshPromise: Promise<void> | null = null;
let _lastOddsRefresh = 0;
const ODDS_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min
const ODDS_QUERY_CHUNK_SIZE = 60;

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

  // Get latest odds — chunked to avoid oversized IN() URL/query failures
  const gameIds = games.map((g) => g.id);
  const gameIdChunks = chunkArray(gameIds, ODDS_QUERY_CHUNK_SIZE);

  const oddsChunkResults = await Promise.all(
    gameIdChunks.map((ids) =>
      supabase
        .from("odds_snapshots")
        .select("game_id, market_type, home_price, away_price, line, captured_at")
        .in("game_id", ids)
        .order("captured_at", { ascending: false })
        .limit(5000)
    )
  );

  const odds = oddsChunkResults.flatMap((res) => {
    if (res.error) {
      console.warn("odds_snapshots fetch failed for chunk:", res.error.message);
      return [];
    }
    return res.data || [];
  });

  // Group odds by game_id for O(1) lookup instead of O(n) filter per game
  const oddsByGame = new Map<string, typeof odds>();
  odds.forEach((o) => {
    if (!oddsByGame.has(o.game_id)) oddsByGame.set(o.game_id, []);
    oddsByGame.get(o.game_id)!.push(o);
  });

  // Also fetch BDL odds from nba_game_odds as fallback
  const bdlChunkResults = await Promise.all(
    gameIdChunks.map((ids) =>
      supabase
        .from("nba_game_odds")
        .select("game_key, market, home_line, away_line, total, home_odds, away_odds, over_odds, under_odds, updated_at")
        .in("game_key", ids)
        .order("updated_at", { ascending: false })
        .limit(5000)
    )
  );

  const bdlOdds = bdlChunkResults.flatMap((res) => {
    if (res.error) {
      console.warn("nba_game_odds fetch failed for chunk:", res.error.message);
      return [];
    }
    return res.data || [];
  });

  const bdlOddsByGame = new Map<string, typeof bdlOdds>();
  bdlOdds.forEach((o) => {
    if (!bdlOddsByGame.has(o.game_key)) bdlOddsByGame.set(o.game_key, []);
    bdlOddsByGame.get(o.game_key)!.push(o);
  });

  return games.map((game) => {
    const gameOdds = oddsByGame.get(game.id) || [];
    // Merge all moneyline rows to get both home and away prices
    const mlRows = gameOdds.filter((o) => o.market_type === "moneyline");
    const spreadRows = gameOdds.filter((o) => o.market_type === "spread");
    const totalRows = gameOdds.filter((o) => o.market_type === "total");

    let mlHome: number | null = null, mlAway: number | null = null;
    for (const r of mlRows) {
      if (mlHome === 0 && r.home_price != null) mlHome = r.home_price;
      if (mlAway === 0 && r.away_price != null) mlAway = r.away_price;
      if (mlHome !== 0 && mlAway !== 0) break;
    }

    let spHome: number | null = null;
    let spAway: number | null = null;
    let spLine: number | null = null;
    for (const r of spreadRows) {
      if (spHome == null && r.home_price != null) spHome = r.home_price;
      if (spAway == null && r.away_price != null) spAway = r.away_price;
      if (spLine == null && r.line != null) spLine = r.line;
      if (spHome != null && spAway != null && spLine != null) break;
    }

    let totOver: number | null = null;
    let totUnder: number | null = null;
    let totLine: number | null = null;
    for (const r of totalRows) {
      if (totOver == null && r.home_price != null) totOver = r.home_price;
      if (totUnder == null && r.away_price != null) totUnder = r.away_price;
      if (totLine == null && r.line != null) totLine = r.line;
      if (totOver != null && totUnder != null && totLine != null) break;
    }

    // Fallback to BDL nba_game_odds if odds_snapshots has no/partial data
    const bdl = bdlOddsByGame.get(game.id) || [];
    if (bdl.length > 0) {
      const bdlMl = bdl.find((o) => o.market === "h2h" || o.market === "moneyline");
      const bdlSp = bdl.find((o) => o.market === "spreads" || o.market === "spread");
      const bdlTot = bdl.find((o) => o.market === "totals" || o.market === "total");

      if (mlHome === 0 && bdlMl?.home_odds != null) mlHome = bdlMl.home_odds;
      if (mlAway === 0 && bdlMl?.away_odds != null) mlAway = bdlMl.away_odds;

      if (spHome == null && bdlSp?.home_odds != null) spHome = bdlSp.home_odds;
      if (spAway == null && bdlSp?.away_odds != null) spAway = bdlSp.away_odds;
      if (spLine == null && bdlSp?.home_line != null) spLine = bdlSp.home_line;

      if (totOver == null && bdlTot?.over_odds != null) totOver = bdlTot.over_odds;
      if (totUnder == null && bdlTot?.under_odds != null) totUnder = bdlTot.under_odds;
      if (totLine == null && bdlTot?.total != null) totLine = bdlTot.total;
    }

    return {
      ...game,
      source: "manual" as const,
      created_at: "",
      updated_at: "",
      odds: {
        moneyline: { home: mlHome, away: mlAway },
        spread: { home: spHome ?? -110, away: spAway ?? -110, line: spLine ?? 0 },
        total: { over: totOver ?? -110, under: totUnder ?? -110, line: totLine ?? 0 },
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
      const hasLive = games?.some((g) => g.status === "live" || g.status === "in_progress");
      return hasLive ? 30_000 : false;
    },
    select: (games) =>
      league && league !== "ALL"
        ? games.filter((g) => g.league === league)
        : games,
  });
}
