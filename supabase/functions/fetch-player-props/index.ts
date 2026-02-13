import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SDIO_BASE = "https://api.sportsdata.io/v3";

const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
};

const SDIO_SPORT_KEYS: Record<string, string> = {
  NBA: "nba",
  NFL: "nfl",
  MLB: "mlb",
  NHL: "nhl",
};

const PLAYER_PROP_MARKETS = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_blocks",
  "player_steals",
  "player_points_rebounds_assists",
  "player_turnovers",
  "player_double_double",
];

const MARKET_LABELS: Record<string, string> = {
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "3-Pointers",
  player_blocks: "Blocks",
  player_steals: "Steals",
  player_points_rebounds_assists: "Pts+Reb+Ast",
  player_turnovers: "Turnovers",
  player_double_double: "Double-Double",
};

// Map SportsDataIO market names to our market keys
const SDIO_MARKET_MAP: Record<string, string> = {
  "Points": "player_points",
  "Rebounds": "player_rebounds",
  "Assists": "player_assists",
  "Three Pointers Made": "player_threes",
  "Blocked Shots": "player_blocks",
  "Steals": "player_steals",
  "Pts+Rebs+Asts": "player_points_rebounds_assists",
  "Turnovers": "player_turnovers",
  "Double Double": "player_double_double",
  // NHL-specific
  "Goals": "player_points",
  "Shots on Goal": "player_shots",
  "Saves": "player_saves",
};

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

// ─── SOURCE 1: The Odds API ───────────────────────────────────────────────────

async function fetchPropsFromOddsAPI(
  apiKey: string,
  sportKey: string,
  eventId: string,
  markets: string[]
): Promise<PropRow[]> {
  const props: PropRow[] = [];

  for (let i = 0; i < markets.length; i += 3) {
    if (i > 0) await delay(1200);

    const batch = markets.slice(i, i + 3);
    const marketsParam = batch.join(",");
    const url = `${THE_ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${marketsParam}&oddsFormat=american`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const body = await resp.text();
        console.warn(`[OddsAPI] ${resp.status} for event ${eventId}, markets ${marketsParam}: ${body}`);
        continue;
      }

      const data = await resp.json();
      const remaining = resp.headers.get("x-requests-remaining");
      console.log(`[OddsAPI] remaining: ${remaining}`);

      for (const bk of data.bookmakers || []) {
        for (const market of bk.markets || []) {
          const playerOutcomes = new Map<string, { over?: any; under?: any }>();
          for (const outcome of market.outcomes || []) {
            const playerName = outcome.description || outcome.name;
            if (!playerOutcomes.has(playerName)) playerOutcomes.set(playerName, {});
            const entry = playerOutcomes.get(playerName)!;
            if (outcome.name === "Over") entry.over = outcome;
            else if (outcome.name === "Under") entry.under = outcome;
          }

          for (const [playerName, outcomes] of playerOutcomes) {
            props.push({
              game_id: "",
              external_event_id: eventId,
              player_name: playerName,
              market_key: market.key,
              market_label: MARKET_LABELS[market.key] || market.key,
              bookmaker: bk.key,
              line: outcomes.over?.point ?? outcomes.under?.point ?? null,
              over_price: outcomes.over?.price ?? null,
              under_price: outcomes.under?.price ?? null,
            });
          }
        }
      }
    } catch (err) {
      console.error(`[OddsAPI] Error for event ${eventId}:`, err);
    }
  }

  return props;
}

// ─── SOURCE 2: SportsDataIO ──────────────────────────────────────────────────

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
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[SDIO] ${resp.status} for game ${sdioGameId}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = await resp.json();
    if (!Array.isArray(data)) return [];

    for (const market of data) {
      const marketName = market.BettingMarketType?.Name || market.Name || "";
      const marketKey = SDIO_MARKET_MAP[marketName] || marketName.toLowerCase().replace(/\s+/g, "_");

      for (const outcome of market.BettingOutcomes || []) {
        if (!outcome.PlayerName) continue;

        const isOver = outcome.BettingOutcomeType === "Over";
        const isUnder = outcome.BettingOutcomeType === "Under";

        // Find matching player entry to pair over/under
        const existing = props.find(
          (p) => p.player_name === outcome.PlayerName && p.market_key === marketKey && p.bookmaker === (market.Sportsbook?.Name || "sportsdataio")
        );

        if (existing) {
          if (isOver) {
            existing.over_price = outcome.PayoutAmerican ?? null;
            existing.line = outcome.Value ?? existing.line;
          } else if (isUnder) {
            existing.under_price = outcome.PayoutAmerican ?? null;
          }
        } else {
          props.push({
            game_id: "",
            external_event_id: String(sdioGameId),
            player_name: outcome.PlayerName,
            market_key: marketKey,
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

// ─── SDIO game ID lookup helper ──────────────────────────────────────────────

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function toSdioDate(d: Date): string {
  return `${d.getFullYear()}-${MONTHS[d.getMonth()]}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getSdioGameId(
  apiKey: string,
  league: string,
  homeAbbr: string,
  awayAbbr: string,
  gameDate: Date
): Promise<number | null> {
  const sport = SDIO_SPORT_KEYS[league];
  if (!sport) return null;

  const dateStr = toSdioDate(gameDate);
  try {
    const resp = await fetch(`${SDIO_BASE}/${sport}/scores/json/GamesByDate/${dateStr}?key=${apiKey}`);
    if (!resp.ok) {
      await resp.text();
      return null;
    }
    const games = await resp.json();
    if (!Array.isArray(games)) return null;

    // Try to match by team abbreviations
    const match = games.find((g: any) =>
      (g.HomeTeam === homeAbbr && g.AwayTeam === awayAbbr) ||
      (g.HomeTeam?.toUpperCase() === homeAbbr?.toUpperCase() && g.AwayTeam?.toUpperCase() === awayAbbr?.toUpperCase())
    );
    return match?.GameID ?? null;
  } catch {
    return null;
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oddsApiKey = Deno.env.get("THE_ODDS_API_KEY");
    const sdioApiKey = Deno.env.get("SPORTSDATAIO_API_KEY");

    if (!oddsApiKey && !sdioApiKey) {
      return new Response(
        JSON.stringify({ error: "No API keys configured for player props" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const gameId = url.searchParams.get("game_id");
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetEvents: { eventId: string; gameId: string; homeAbbr: string; awayAbbr: string; startTime: string }[] = [];

    if (gameId) {
      const { data: game } = await supabase
        .from("games")
        .select("id, external_id, home_abbr, away_abbr, start_time")
        .eq("id", gameId)
        .single();

      if (!game?.external_id) {
        return new Response(
          JSON.stringify({ error: "Game not found or no external_id" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetEvents = [{ eventId: game.external_id, gameId: game.id, homeAbbr: game.home_abbr, awayAbbr: game.away_abbr, startTime: game.start_time }];
    } else {
      // Fetch events from The Odds API to get event IDs
      if (oddsApiKey) {
        const eventsUrl = `${THE_ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${oddsApiKey}`;
        const eventsResp = await fetch(eventsUrl);
        if (eventsResp.ok) {
          const events = await eventsResp.json();
          for (const event of events) {
            const { data: game } = await supabase
              .from("games")
              .select("id, home_abbr, away_abbr, start_time")
              .eq("external_id", event.id)
              .maybeSingle();

            if (game) {
              targetEvents.push({ eventId: event.id, gameId: game.id, homeAbbr: game.home_abbr, awayAbbr: game.away_abbr, startTime: game.start_time });
            }
          }
        } else {
          await eventsResp.text();
          console.warn(`[OddsAPI] Events fetch failed: ${eventsResp.status}`);
        }
      }

      // If no events found from Odds API, try to get games from DB directly for SDIO fallback
      if (targetEvents.length === 0) {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: dbGames } = await supabase
          .from("games")
          .select("id, external_id, home_abbr, away_abbr, start_time")
          .eq("league", league)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", endOfDay.toISOString());

        for (const g of dbGames || []) {
          targetEvents.push({
            eventId: g.external_id || "",
            gameId: g.id,
            homeAbbr: g.home_abbr,
            awayAbbr: g.away_abbr,
            startTime: g.start_time,
          });
        }
      }

      targetEvents = targetEvents.slice(0, 5);
    }

    console.log(`Fetching props for ${targetEvents.length} events in ${league}`);

    let totalProps = 0;
    const sources: string[] = [];

    for (const event of targetEvents) {
      let props: PropRow[] = [];

      // Try The Odds API first
      if (oddsApiKey && event.eventId) {
        props = await fetchPropsFromOddsAPI(oddsApiKey, sportKey, event.eventId, PLAYER_PROP_MARKETS);
        if (props.length > 0) {
          sources.push("odds-api");
          console.log(`[OddsAPI] Got ${props.length} props for game ${event.gameId}`);
        }
      }

      // Fallback to SportsDataIO if no props from primary source
      if (props.length === 0 && sdioApiKey) {
        console.log(`[SDIO] Falling back for game ${event.gameId} (${event.awayAbbr}@${event.homeAbbr})`);
        const gameDate = new Date(event.startTime);
        const sdioGameId = await getSdioGameId(sdioApiKey, league, event.homeAbbr, event.awayAbbr, gameDate);

        if (sdioGameId) {
          props = await fetchPropsFromSportsDataIO(sdioApiKey, league, sdioGameId);
          if (props.length > 0) {
            sources.push("sportsdataio");
            console.log(`[SDIO] Got ${props.length} props for game ${event.gameId}`);
          }
        } else {
          console.warn(`[SDIO] Could not find SDIO game for ${event.awayAbbr}@${event.homeAbbr}`);
        }
      }

      if (props.length === 0) {
        console.log(`No props from any source for game ${event.gameId}`);
        continue;
      }

      // Set game_id and store
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
      JSON.stringify({
        success: true,
        events_processed: targetEvents.length,
        props_stored: totalProps,
        sources: [...new Set(sources)],
        fetched_at: new Date().toISOString(),
      }),
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
