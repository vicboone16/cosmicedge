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

// ─── All player prop markets per league ─────────────────────────────────────

const LEAGUE_MARKETS: Record<string, string[]> = {
  NBA: [
    "player_points", "player_points_q1", "player_rebounds", "player_rebounds_q1",
    "player_assists", "player_assists_q1", "player_threes", "player_blocks",
    "player_steals", "player_blocks_steals", "player_turnovers",
    "player_points_rebounds_assists", "player_points_rebounds", "player_points_assists",
    "player_rebounds_assists", "player_field_goals", "player_frees_made",
    "player_frees_attempts", "player_first_basket", "player_first_team_basket",
    "player_double_double", "player_triple_double",
  ],
  NHL: [
    "player_points", "player_power_play_points", "player_assists",
    "player_blocked_shots", "player_shots_on_goal", "player_goals",
    "player_total_saves", "player_goal_scorer_first", "player_goal_scorer_last",
    "player_goal_scorer_anytime",
  ],
  MLB: [
    "batter_home_runs", "batter_first_home_run", "batter_hits", "batter_total_bases",
    "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis", "batter_singles",
    "batter_doubles", "batter_triples", "batter_walks", "batter_strikeouts",
    "batter_stolen_bases", "pitcher_strikeouts", "pitcher_record_a_win",
    "pitcher_hits_allowed", "pitcher_walks", "pitcher_earned_runs", "pitcher_outs",
  ],
  NFL: [
    "player_pass_yds", "player_pass_tds", "player_pass_completions",
    "player_pass_attempts", "player_pass_interceptions", "player_rush_yds",
    "player_rush_attempts", "player_rush_tds", "player_receptions",
    "player_reception_yds", "player_reception_tds", "player_anytime_td",
    "player_1st_td", "player_last_td", "player_sacks", "player_solo_tackles",
    "player_field_goals", "player_kicking_points",
  ],
};

// Game-period markets to also fetch per league
const PERIOD_MARKETS: Record<string, string[]> = {
  NBA: [
    "h2h_q1", "h2h_h1", "spreads_h1", "totals_q1", "totals_h1",
    "team_totals_q1", "team_totals_h1",
  ],
  NHL: [
    "h2h_p1", "h2h_p2", "h2h_p3", "totals_p1", "totals_p2", "totals_p3",
    "spreads_p1", "team_totals_p1", "team_totals_p2", "team_totals_p3",
  ],
  MLB: [
    "h2h_1st_1_innings", "h2h_1st_5_innings",
    "totals_1st_1_innings", "totals_1st_5_innings",
    "spreads_1st_5_innings",
  ],
  NFL: [
    "h2h_q1", "h2h_h1", "spreads_h1", "totals_q1", "totals_h1",
  ],
};

// Label lookup for all markets
const MARKET_LABELS: Record<string, string> = {
  player_points: "Points", player_points_q1: "Points Q1",
  player_rebounds: "Rebounds", player_rebounds_q1: "Rebounds Q1",
  player_assists: "Assists", player_assists_q1: "Assists Q1",
  player_threes: "3-Pointers", player_blocks: "Blocks",
  player_steals: "Steals", player_blocks_steals: "Blk+Stl",
  player_turnovers: "Turnovers",
  player_points_rebounds_assists: "Pts+Reb+Ast",
  player_points_rebounds: "Pts+Reb", player_points_assists: "Pts+Ast",
  player_rebounds_assists: "Reb+Ast", player_field_goals: "Field Goals",
  player_frees_made: "Free Throws", player_frees_attempts: "FT Attempts",
  player_first_basket: "First Basket", player_first_team_basket: "1st Team Basket",
  player_double_double: "Double-Double", player_triple_double: "Triple-Double",
  // NHL
  player_power_play_points: "PP Points", player_blocked_shots: "Blocked Shots",
  player_shots_on_goal: "Shots on Goal", player_goals: "Goals",
  player_total_saves: "Saves",
  player_goal_scorer_first: "First Goal", player_goal_scorer_last: "Last Goal",
  player_goal_scorer_anytime: "Anytime Goal",
  // MLB
  batter_home_runs: "Home Runs", batter_first_home_run: "First HR",
  batter_hits: "Hits", batter_total_bases: "Total Bases",
  batter_rbis: "RBIs", batter_runs_scored: "Runs Scored",
  batter_hits_runs_rbis: "H+R+RBI", batter_singles: "Singles",
  batter_doubles: "Doubles", batter_triples: "Triples",
  batter_walks: "Walks", batter_strikeouts: "Strikeouts (B)",
  batter_stolen_bases: "Stolen Bases",
  pitcher_strikeouts: "Strikeouts (P)", pitcher_record_a_win: "Pitcher Win",
  pitcher_hits_allowed: "Hits Allowed", pitcher_walks: "Walks (P)",
  pitcher_earned_runs: "Earned Runs", pitcher_outs: "Outs",
  // NFL
  player_pass_yds: "Pass Yards", player_pass_tds: "Pass TDs",
  player_pass_completions: "Completions", player_pass_attempts: "Pass Att",
  player_pass_interceptions: "Interceptions", player_rush_yds: "Rush Yards",
  player_rush_attempts: "Rush Att", player_rush_tds: "Rush TDs",
  player_receptions: "Receptions", player_reception_yds: "Rec Yards",
  player_reception_tds: "Rec TDs", player_anytime_td: "Anytime TD",
  player_1st_td: "First TD", player_last_td: "Last TD",
  player_sacks: "Sacks", player_solo_tackles: "Solo Tackles",
  player_kicking_points: "Kicking Pts",
  // Period markets
  h2h_q1: "ML Q1", h2h_q2: "ML Q2", h2h_q3: "ML Q3", h2h_q4: "ML Q4",
  h2h_h1: "ML 1H", h2h_h2: "ML 2H",
  h2h_p1: "ML P1", h2h_p2: "ML P2", h2h_p3: "ML P3",
  h2h_1st_1_innings: "ML 1st Inn", h2h_1st_5_innings: "ML 1st 5 Inn",
  spreads_h1: "Spread 1H", spreads_h2: "Spread 2H",
  spreads_p1: "Spread P1", spreads_p2: "Spread P2", spreads_p3: "Spread P3",
  spreads_1st_5_innings: "Spread 1st 5 Inn",
  totals_q1: "O/U Q1", totals_h1: "O/U 1H",
  totals_p1: "O/U P1", totals_p2: "O/U P2", totals_p3: "O/U P3",
  totals_1st_1_innings: "O/U 1st Inn", totals_1st_5_innings: "O/U 1st 5 Inn",
  team_totals_q1: "TT Q1", team_totals_h1: "TT 1H",
  team_totals_p1: "TT P1", team_totals_p2: "TT P2", team_totals_p3: "TT P3",
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
  "Goals": "player_goals",
  "Shots on Goal": "player_shots_on_goal",
  "Saves": "player_total_saves",
  "Home Runs": "batter_home_runs",
  "Hits": "batter_hits",
  "Total Bases": "batter_total_bases",
  "RBIs": "batter_rbis",
  "Runs Scored": "batter_runs_scored",
  "Stolen Bases": "batter_stolen_bases",
  "Strikeouts": "pitcher_strikeouts",
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

  // Batch 3 markets per request with throttling
  for (let i = 0; i < markets.length; i += 3) {
    if (i > 0) await delay(1200);

    const batch = markets.slice(i, i + 3);
    const marketsParam = batch.join(",");
    const url = `${THE_ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${marketsParam}&oddsFormat=american`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const body = await resp.text();
        if (resp.status === 401) {
          console.warn(`[OddsAPI] 401 - API key may lack Additional Markets tier`);
          return props; // Stop trying this source
        }
        if (resp.status === 429) {
          console.warn(`[OddsAPI] Rate limited, backing off...`);
          await delay(5000);
          continue;
        }
        console.warn(`[OddsAPI] ${resp.status} for event ${eventId}: ${body.slice(0, 200)}`);
        continue;
      }

      const data = await resp.json();
      const remaining = resp.headers.get("x-requests-remaining");
      if (remaining) console.log(`[OddsAPI] remaining: ${remaining}`);

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
    const includeAlternates = url.searchParams.get("alternates") === "true";
    const includePeriods = url.searchParams.get("periods") !== "false"; // default true
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build market list
    const playerMarkets = LEAGUE_MARKETS[league] || [];
    const periodMarkets = includePeriods ? (PERIOD_MARKETS[league] || []) : [];
    const allMarkets = [...playerMarkets, ...periodMarkets];

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

    console.log(`Fetching props for ${targetEvents.length} events in ${league} (${allMarkets.length} markets)`);

    let totalProps = 0;
    const sources: string[] = [];

    for (const event of targetEvents) {
      let props: PropRow[] = [];

      // Try The Odds API first
      if (oddsApiKey && event.eventId) {
        props = await fetchPropsFromOddsAPI(oddsApiKey, sportKey, event.eventId, allMarkets);
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
        markets_requested: allMarkets.length,
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
