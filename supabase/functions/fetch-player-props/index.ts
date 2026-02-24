// fetch-player-props — Player props fetcher using SGO v2 + SportsDataIO fallback
// Uses SGO /events endpoint with proper params and player name resolution from event.players
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

// Fallback: derive player name from statEntityID (e.g. "lebron_james_lal_NBA" → "Lebron James")
function formatPlayerName(playerId: string): string {
  if (!playerId) return "Unknown";
  const parts = playerId.split("_");
  // Remove trailing team/league suffixes (e.g. _LAL_NBA or _NBA)
  const cleaned = parts.filter(p => p.length > 1 || parts.length <= 2);
  // Take name parts (usually first N-2 parts are the name)
  const nameParts = cleaned.length > 2 ? cleaned.slice(0, -2) : cleaned;
  return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

// SGO team abbreviation mapping
const TEAM_ABBR_MAP: Record<string, string> = {
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
};

function makeAbbr(name: string): string {
  return TEAM_ABBR_MAP[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
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

// ─── SGO v2: Discover events using proper API params ───

interface SGOPlayer {
  playerID: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  teamID?: string;
}

interface SGOEvent {
  eventID: string;
  leagueID?: string;
  teams?: {
    home?: { teamID?: string; names?: { short?: string; long?: string; medium?: string } };
    away?: { teamID?: string; names?: { short?: string; long?: string; medium?: string } };
  };
  players?: Record<string, SGOPlayer>;
  status?: { startsAt?: string; started?: boolean; ended?: boolean };
  odds?: Record<string, any>;
}

async function discoverSGOEvents(apiKey: string, league: string): Promise<SGOEvent[]> {
  const allEvents: SGOEvent[] = [];
  let cursor: string | null = null;
  let rateLimitHits = 0;

  // Use proper SGO params per API docs: oddsAvailable, started=false, type=match
  // Auth via apiKey query param (per securitySchemes.ApiKeyParam)
  for (let page = 0; page < 5; page++) {
    try {
      const params = new URLSearchParams({
        apiKey,
        leagueID: league,
        oddsAvailable: "true",
        started: "false",
        type: "match",
        limit: "50",
      });
      if (cursor) params.set("cursor", cursor);

      const url = `${SGO_BASE}/events/?${params.toString().replace(apiKey, "***")}`;
      console.log(`[SGO] Fetching: ${url}`);
      const realUrl = `${SGO_BASE}/events/?${params}`;
      const resp = await fetch(realUrl);

      if (resp.status === 429) {
        rateLimitHits++;
        if (rateLimitHits >= 2) {
          console.warn("[SGO] Rate limited twice, aborting to preserve budget");
          break;
        }
        console.warn("[SGO] Rate limited, backing off 10s...");
        await delay(10000);
        continue;
      }
      if (!resp.ok) {
        const body = await resp.text();
        console.warn(`[SGO] Event discovery ${resp.status}: ${body.slice(0, 300)}`);
        break;
      }

      const json = await resp.json();
      const events = json.data || [];
      console.log(`[SGO] Page ${page}: got ${events.length} events`);
      if (json.notice) console.warn(`[SGO] Notice: ${json.notice}`);
      allEvents.push(...events);

      // Use cursor for pagination
      if (json.nextCursor) {
        cursor = json.nextCursor;
      } else {
        break; // No more pages
      }

      if (events.length < 50) break;
      // Small delay between pages to avoid rate limits
      await delay(500);
    } catch (err) {
      console.error("[SGO] Event discovery error:", err);
      break;
    }
  }

  return allEvents;
}

function resolvePlayerName(event: SGOEvent, statEntityID: string): string {
  // First try the event.players map which has proper names
  const players = event.players || {};

  // statEntityID might match a playerID key in players
  if (players[statEntityID]) {
    const p = players[statEntityID];
    if (p.name) return p.name;
    if (p.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
  }

  // Try matching by playerID within the players map
  for (const p of Object.values(players)) {
    if (p.playerID === statEntityID) {
      if (p.name) return p.name;
      if (p.firstName && p.lastName) return `${p.firstName} ${p.lastName}`;
    }
  }

  // Also check odds[oddID].playerID → players lookup
  // Fallback to parsing the statEntityID string
  return formatPlayerName(statEntityID);
}

function extractPlayerPropsFromEvent(event: SGOEvent): PropRow[] {
  const props: PropRow[] = [];
  const odds = event.odds || {};

  // Group by player+stat to pair over/under
  const grouped = new Map<string, { over?: any; under?: any; statID: string; playerName: string; bookmaker: string }>();

  for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
    const statEntityID = oddData.statEntityID || "all";
    const statID = oddData.statID || "";
    const isPlayerProp = statEntityID !== "all" && statEntityID !== "home" && statEntityID !== "away";
    if (!isPlayerProp) continue;

    // Use the playerID from odds if available, or statEntityID
    const playerKey = oddData.playerID || statEntityID;
    const playerName = resolvePlayerName(event, playerKey);
    const sideID = oddData.sideID || "";
    const isOver = sideID === "over" || oddID.includes("-over") || oddID.includes("-ou-over");
    const isUnder = sideID === "under" || oddID.includes("-under") || oddID.includes("-ou-under");

    // Use bookOdds/bookOverUnder/bookSpread as primary (consensus from SGO)
    const groupKey = `${statEntityID}|${statID}|consensus`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, { statID, playerName, bookmaker: "sgo_consensus" });
    const entry = grouped.get(groupKey)!;

    if (isOver) entry.over = { odds: oddData.bookOdds, overUnder: oddData.bookOverUnder, spread: oddData.bookSpread, ...oddData };
    else if (isUnder) entry.under = { odds: oddData.bookOdds, overUnder: oddData.bookOverUnder, spread: oddData.bookSpread, ...oddData };

    // Per-bookmaker
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
        external_event_id: event.eventID,
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

  return props;
}

// Match SGO event to a DB game by team abbreviations
function matchSGOEventToGame(
  event: SGOEvent,
  dbGames: { id: string; home_abbr: string; away_abbr: string; start_time: string }[]
): { id: string; home_abbr: string; away_abbr: string; start_time: string } | null {
  const homeNames = event.teams?.home?.names;
  const awayNames = event.teams?.away?.names;
  const homeAbbr = homeNames?.short || makeAbbr(homeNames?.long || homeNames?.medium || "");
  const awayAbbr = awayNames?.short || makeAbbr(awayNames?.long || awayNames?.medium || "");

  // Direct abbreviation match
  const match = dbGames.find(g =>
    g.home_abbr.toUpperCase() === homeAbbr.toUpperCase() &&
    g.away_abbr.toUpperCase() === awayAbbr.toUpperCase()
  );
  if (match) return match;

  // Fuzzy: try matching by just home or away
  const fuzzy = dbGames.find(g =>
    (g.home_abbr.toUpperCase() === homeAbbr.toUpperCase() || g.away_abbr.toUpperCase() === awayAbbr.toUpperCase())
  );
  return fuzzy || null;
}

// ─── SOURCE 2: SportsDataIO (FALLBACK) ──────────────────────────────────────

async function fetchPropsFromSportsDataIO(
  apiKey: string, league: string, sdioGameId: number
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
    const windowHours = url.searchParams.get("window_hours");
    const lookbackMinutes = url.searchParams.get("lookback_minutes");

    // Determine which DB games to fetch props for
    let dbGames: { id: string; home_abbr: string; away_abbr: string; start_time: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time").eq("id", gameId).single();
      if (!game) {
        return new Response(JSON.stringify({ error: "Game not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      dbGames = [game];
    } else if (lookbackMinutes) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - Number(lookbackMinutes) * 60000);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time")
        .eq("league", league)
        .gte("start_time", cutoff.toISOString())
        .lte("start_time", now.toISOString())
        .in("status", ["scheduled", "live", "in_progress"]);
      dbGames = data || [];
    } else if (windowHours) {
      const now = new Date();
      const horizon = new Date(now.getTime() + Number(windowHours) * 3600000);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time")
        .eq("league", league)
        .gte("start_time", now.toISOString())
        .lte("start_time", horizon.toISOString())
        .in("status", ["scheduled"]);
      dbGames = data || [];
    } else {
      // Default: today + tomorrow games (broader window)
      const today = new Date();
      const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(today); endOfTomorrow.setDate(endOfTomorrow.getDate() + 1); endOfTomorrow.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("games").select("id, home_abbr, away_abbr, start_time")
        .eq("league", league)
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfTomorrow.toISOString())
        .in("status", ["scheduled", "live", "in_progress"]);
      dbGames = (data || []).slice(0, 15);
    }

    console.log(`Fetching props for ${dbGames.length} DB games in ${league}`);
    if (dbGames.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_processed: 0, props_stored: 0, sources: [], fetched_at: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalProps = 0;
    const sources: string[] = [];

    // ─── SGO: Discover events by league with proper filters ───
    if (sgoApiKey) {
      console.log(`[SGO] Discovering upcoming events for ${league}...`);
      const sgoEvents = await discoverSGOEvents(sgoApiKey, league);
      console.log(`[SGO] Found ${sgoEvents.length} upcoming events with odds for ${league}`);

      for (const sgoEvent of sgoEvents) {
        const matchedGame = matchSGOEventToGame(sgoEvent, dbGames);
        if (!matchedGame) continue;

        const eventProps = extractPlayerPropsFromEvent(sgoEvent);
        if (eventProps.length === 0) continue;

        console.log(`[SGO] ${matchedGame.home_abbr} vs ${matchedGame.away_abbr}: ${eventProps.length} player props`);
        sources.push("sgo");

        const propsWithGameId = eventProps.map(p => ({ ...p, game_id: matchedGame.id }));
        await supabase.from("player_props").delete().eq("game_id", matchedGame.id);

        for (let i = 0; i < propsWithGameId.length; i += 100) {
          const chunk = propsWithGameId.slice(i, i + 100);
          const { error } = await supabase.from("player_props").insert(chunk);
          if (error) console.error("Insert error:", error.message);
        }

        totalProps += propsWithGameId.length;
        // Remove matched game so we don't try SDIO fallback for it
        dbGames = dbGames.filter(g => g.id !== matchedGame.id);
      }
    }

    // ─── SDIO fallback for remaining unmatched games ───
    if (sdioApiKey && dbGames.length > 0) {
      console.log(`[SDIO] Falling back for ${dbGames.length} remaining games`);
      for (const game of dbGames) {
        const gameDate = new Date(game.start_time);
        const sdioGameId = await getSdioGameId(sdioApiKey, league, game.home_abbr, game.away_abbr, gameDate);
        if (!sdioGameId) continue;

        const sdioProps = await fetchPropsFromSportsDataIO(sdioApiKey, league, sdioGameId);
        if (sdioProps.length === 0) continue;

        console.log(`[SDIO] ${game.home_abbr} vs ${game.away_abbr}: ${sdioProps.length} player props`);
        sources.push("sportsdataio");

        const propsWithGameId = sdioProps.map(p => ({ ...p, game_id: game.id }));
        await supabase.from("player_props").delete().eq("game_id", game.id);

        for (let i = 0; i < propsWithGameId.length; i += 100) {
          const chunk = propsWithGameId.slice(i, i + 100);
          const { error } = await supabase.from("player_props").insert(chunk);
          if (error) console.error("Insert error:", error.message);
        }

        totalProps += propsWithGameId.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, events_processed: dbGames.length, props_stored: totalProps, sources: [...new Set(sources)], fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-player-props error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
