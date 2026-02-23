// fetch-player-props — Player props fetcher using SGO v2 + SportsDataIO fallback
// Replaces The Odds API with SGO as primary source
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_BASE = "https://api.sportsdata.io/v3";
const SGO_BASE = "https://api.sportsgameodds.com/v2";

const SDIO_SPORT_KEYS: Record<string, string> = {
  NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl",
};

// Market labels for display
const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_rebounds: "Rebounds", player_assists: "Assists",
  player_threes: "3-Pointers", player_blocks: "Blocks", player_steals: "Steals",
  player_turnovers: "Turnovers", player_points_rebounds_assists: "Pts+Reb+Ast",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_double_double: "Double-Double",
  player_triple_double: "Triple-Double", player_field_goals: "Field Goals",
  player_goals: "Goals", player_shots_on_goal: "Shots on Goal", player_total_saves: "Saves",
  player_power_play_points: "PP Points", player_goal_scorer_anytime: "Anytime Goal",
  batter_home_runs: "Home Runs", batter_hits: "Hits", batter_total_bases: "Total Bases",
  batter_rbis: "RBIs", batter_runs_scored: "Runs Scored", batter_strikeouts: "Strikeouts (B)",
  pitcher_strikeouts: "Strikeouts (P)", pitcher_earned_runs: "Earned Runs",
  player_pass_yds: "Pass Yards", player_pass_tds: "Pass TDs",
  player_rush_yds: "Rush Yards", player_receptions: "Receptions",
  player_reception_yds: "Rec Yards", player_anytime_td: "Anytime TD",
};

// Map SportsDataIO market names to our keys
const SDIO_MARKET_MAP: Record<string, string> = {
  "Points": "player_points", "Rebounds": "player_rebounds", "Assists": "player_assists",
  "Three Pointers Made": "player_threes", "Blocked Shots": "player_blocks",
  "Steals": "player_steals", "Pts+Rebs+Asts": "player_points_rebounds_assists",
  "Turnovers": "player_turnovers", "Double Double": "player_double_double",
  "Goals": "player_goals", "Shots on Goal": "player_shots_on_goal",
  "Saves": "player_total_saves", "Home Runs": "batter_home_runs",
  "Hits": "batter_hits", "Total Bases": "batter_total_bases",
  "RBIs": "batter_rbis", "Runs Scored": "batter_runs_scored",
  "Stolen Bases": "batter_stolen_bases", "Strikeouts": "pitcher_strikeouts",
};

// Map SGO statID to our market key
function sgoStatToMarketKey(statID: string): string {
  const map: Record<string, string> = {
    points: "player_points", rebounds: "player_rebounds", assists: "player_assists",
    threePointersMade: "player_threes", blocks: "player_blocks", steals: "player_steals",
    turnovers: "player_turnovers", doubleDouble: "player_double_double",
    tripleDouble: "player_triple_double", fieldGoalsMade: "player_field_goals",
    goals: "player_goals", shotsOnGoal: "player_shots_on_goal", saves: "player_total_saves",
    powerPlayPoints: "player_power_play_points", anytimeGoalScorer: "player_goal_scorer_anytime",
    homeRuns: "batter_home_runs", hits: "batter_hits", totalBases: "batter_total_bases",
    rbis: "batter_rbis", runsScored: "batter_runs_scored", strikeouts: "pitcher_strikeouts",
    passingYards: "player_pass_yds", passingTouchdowns: "player_pass_tds",
    rushingYards: "player_rush_yds", receptions: "player_receptions",
    receivingYards: "player_reception_yds", anytimeTouchdown: "player_anytime_td",
    pointsReboundsAssists: "player_points_rebounds_assists",
    pointsRebounds: "player_points_rebounds", pointsAssists: "player_points_assists",
    reboundsAssists: "player_rebounds_assists",
  };
  return map[statID] || statID;
}

function formatPlayerName(playerId: string): string {
  if (!playerId) return "Unknown";
  const parts = playerId.split("_");
  if (parts.length > 2) {
    const nameParts = parts.slice(0, -2);
    return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  }
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

interface PropRow {
  game_id: string;
  external_event_id: string;
  player_name: string;
  market_key: string;
  market_label: string;
  bookmaker: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── SOURCE 1: SGO v2 (PRIMARY) ────────────────────────────────────────────

async function fetchPropsFromSGO(
  apiKey: string,
  eventId: string,
): Promise<PropRow[]> {
  const props: PropRow[] = [];

  try {
    const url = `${SGO_BASE}/events?eventID=${eventId}&limit=1`;
    const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (resp.status === 429) {
      console.warn("[SGO Props] Rate limited, backing off...");
      await delay(5000);
      return props;
    }
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[SGO Props] ${resp.status}: ${body.slice(0, 200)}`);
      return props;
    }

    const json = await resp.json();
    const events = json.data || [];
    if (events.length === 0) return props;

    const event = events[0];
    const odds = event.odds || {};

    // Group by player+stat to pair over/under
    const grouped = new Map<string, { over?: any; under?: any; statID: string; playerName: string; bookmaker: string }>();

    for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
      const statEntityID = oddData.statEntityID || "all";
      const statID = oddData.statID || "";
      const isPlayerProp = statEntityID !== "all" && statEntityID !== "home" && statEntityID !== "away";
      if (!isPlayerProp) continue;

      const playerName = formatPlayerName(statEntityID);
      const sideID = oddData.sideID || "";
      const isOver = sideID === "over" || oddID.includes("-over") || oddID.includes("-ou-over");
      const isUnder = sideID === "under" || oddID.includes("-under") || oddID.includes("-ou-under");

      // Process consensus
      const groupKey = `${statEntityID}|${statID}|consensus`;
      if (!grouped.has(groupKey)) grouped.set(groupKey, { statID, playerName, bookmaker: "sgo_consensus" });
      const entry = grouped.get(groupKey)!;
      if (isOver) entry.over = oddData;
      else if (isUnder) entry.under = oddData;

      // Process per-bookmaker
      if (oddData.byBookmaker) {
        for (const [bkId, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
          const bkGroupKey = `${statEntityID}|${statID}|${bkId}`;
          if (!grouped.has(bkGroupKey)) grouped.set(bkGroupKey, { statID, playerName, bookmaker: `sgo_${bkId}` });
          const bkEntry = grouped.get(bkGroupKey)!;
          if (isOver) bkEntry.over = bkData;
          else if (isUnder) bkEntry.under = bkData;
        }
      }
    }

    for (const [, g] of grouped) {
      const marketKey = sgoStatToMarketKey(g.statID);
      const line = g.over?.overUnder ?? g.over?.spread ?? g.under?.overUnder ?? g.under?.spread ?? null;
      const overPrice = g.over?.odds != null ? Math.round(Number(g.over.odds)) : null;
      const underPrice = g.under?.odds != null ? Math.round(Number(g.under.odds)) : null;

      if (overPrice != null || underPrice != null || line != null) {
        props.push({
          game_id: "",
          external_event_id: eventId,
          player_name: g.playerName,
          market_key: marketKey,
          market_label: MARKET_LABELS[marketKey] || marketKey,
          bookmaker: g.bookmaker,
          line: line != null ? Number(line) : null,
          over_price: overPrice,
          under_price: underPrice,
        });
      }
    }
  } catch (err) {
    console.error(`[SGO Props] Error for event ${eventId}:`, err);
  }

  return props;
}

// ─── SOURCE 2: SportsDataIO (FALLBACK) ──────────────────────────────────────

async function fetchPropsFromSportsDataIO(
  apiKey: string,
  league: string,
  sdioGameId: number
): Promise<PropRow[]> {
  const sport = SDIO_SPORT_KEYS[league];
  if (!sport) return [];

  const url = `${SDIO_BASE}/${sport}/odds/json/BettingPlayerPropsByGameID/${sdioGameId}?key=${apiKey}`;
  const props: PropRow[] = [];

  try {
    const resp = await fetch(url);
    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    if (!Array.isArray(data)) return [];

    for (const market of data) {
      const marketName = market.BettingMarketType?.Name || market.Name || "";
      const marketKey = SDIO_MARKET_MAP[marketName] || marketName.toLowerCase().replace(/\s+/g, "_");

      for (const outcome of market.BettingOutcomes || []) {
        if (!outcome.PlayerName) continue;
        const isOver = outcome.BettingOutcomeType === "Over";
        const isUnder = outcome.BettingOutcomeType === "Under";

        const existing = props.find(
          (p) => p.player_name === outcome.PlayerName && p.market_key === marketKey && p.bookmaker === (market.Sportsbook?.Name || "sportsdataio")
        );

        if (existing) {
          if (isOver) { existing.over_price = outcome.PayoutAmerican ?? null; existing.line = outcome.Value ?? existing.line; }
          else if (isUnder) { existing.under_price = outcome.PayoutAmerican ?? null; }
        } else {
          props.push({
            game_id: "", external_event_id: String(sdioGameId),
            player_name: outcome.PlayerName, market_key: marketKey,
            market_label: MARKET_LABELS[marketKey] || marketName,
            bookmaker: market.Sportsbook?.Name || "sportsdataio",
            line: outcome.Value ?? null,
            over_price: isOver ? (outcome.PayoutAmerican ?? null) : null,
            under_price: isUnder ? (outcome.PayoutAmerican ?? null) : null,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[SDIO] Error for game ${sdioGameId}:`, err);
  }

  return props;
}

// ─── SDIO game ID lookup ──────────────────────────────────────────────

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function toSdioDate(d: Date): string {
  return `${d.getFullYear()}-${MONTHS[d.getMonth()]}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getSdioGameId(apiKey: string, league: string, homeAbbr: string, awayAbbr: string, gameDate: Date): Promise<number | null> {
  const sport = SDIO_SPORT_KEYS[league];
  if (!sport) return null;
  try {
    const resp = await fetch(`${SDIO_BASE}/${sport}/scores/json/GamesByDate/${toSdioDate(gameDate)}?key=${apiKey}`);
    if (!resp.ok) { await resp.text(); return null; }
    const games = await resp.json();
    if (!Array.isArray(games)) return null;
    const match = games.find((g: any) =>
      (g.HomeTeam === homeAbbr && g.AwayTeam === awayAbbr) ||
      (g.HomeTeam?.toUpperCase() === homeAbbr?.toUpperCase() && g.AwayTeam?.toUpperCase() === awayAbbr?.toUpperCase())
    );
    return match?.GameID ?? null;
  } catch { return null; }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sgoApiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    const sdioApiKey = Deno.env.get("SPORTSDATAIO_API_KEY");

    if (!sgoApiKey && !sdioApiKey) {
      return new Response(
        JSON.stringify({ error: "No API keys configured for player props" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const gameId = url.searchParams.get("game_id");

    let targetEvents: { eventId: string; gameId: string; homeAbbr: string; awayAbbr: string; startTime: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase.from("games").select("id, external_id, home_abbr, away_abbr, start_time").eq("id", gameId).single();
      if (!game?.external_id) {
        return new Response(JSON.stringify({ error: "Game not found or no external_id" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      targetEvents = [{ eventId: game.external_id, gameId: game.id, homeAbbr: game.home_abbr, awayAbbr: game.away_abbr, startTime: game.start_time }];
    } else {
      // Get today's games from DB
      const today = new Date();
      const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);

      const { data: dbGames } = await supabase.from("games").select("id, external_id, home_abbr, away_abbr, start_time")
        .eq("league", league)
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());

      for (const g of dbGames || []) {
        targetEvents.push({ eventId: g.external_id || "", gameId: g.id, homeAbbr: g.home_abbr, awayAbbr: g.away_abbr, startTime: g.start_time });
      }

      targetEvents = targetEvents.slice(0, 5);
    }

    console.log(`Fetching props for ${targetEvents.length} events in ${league}`);

    let totalProps = 0;
    const sources: string[] = [];

    for (const event of targetEvents) {
      let props: PropRow[] = [];

      // Primary: SGO
      if (sgoApiKey && event.eventId) {
        // Strip "sgo_" prefix if present to get raw SGO eventID
        const sgoEventId = event.eventId.startsWith("sgo_") ? event.eventId.slice(4) : event.eventId;
        props = await fetchPropsFromSGO(sgoApiKey, sgoEventId);
        if (props.length > 0) {
          sources.push("sgo");
          console.log(`[SGO] Got ${props.length} props for game ${event.gameId}`);
        }
      }

      // Fallback: SportsDataIO
      if (props.length === 0 && sdioApiKey) {
        console.log(`[SDIO] Falling back for game ${event.gameId}`);
        const gameDate = new Date(event.startTime);
        const sdioGameId = await getSdioGameId(sdioApiKey, league, event.homeAbbr, event.awayAbbr, gameDate);
        if (sdioGameId) {
          props = await fetchPropsFromSportsDataIO(sdioApiKey, league, sdioGameId);
          if (props.length > 0) {
            sources.push("sportsdataio");
            console.log(`[SDIO] Got ${props.length} props for game ${event.gameId}`);
          }
        }
      }

      if (props.length === 0) continue;

      const propsWithGameId = props.map((p) => ({ ...p, game_id: event.gameId }));
      await supabase.from("player_props").delete().eq("game_id", event.gameId);

      for (let i = 0; i < propsWithGameId.length; i += 100) {
        const chunk = propsWithGameId.slice(i, i + 100);
        const { error } = await supabase.from("player_props").insert(chunk);
        if (error) console.error("Insert error:", error.message);
      }

      totalProps += propsWithGameId.length;
    }

    return new Response(
      JSON.stringify({ success: true, events_processed: targetEvents.length, props_stored: totalProps, sources: [...new Set(sources)], fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-player-props error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
