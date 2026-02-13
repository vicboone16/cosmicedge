import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
};

const TEAM_ABBR: Record<string, string> = {
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
  "Edmonton Oilers": "EDM", "Toronto Maple Leafs": "TOR", "Montreal Canadiens": "MTL",
  "Ottawa Senators": "OTT", "Winnipeg Jets": "WPG", "Calgary Flames": "CGY",
  "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK", "Colorado Avalanche": "COL",
  "Dallas Stars": "DAL", "Nashville Predators": "NSH", "St Louis Blues": "STL",
  "Minnesota Wild": "MIN", "Carolina Hurricanes": "CAR", "Florida Panthers": "FLA",
  "Tampa Bay Lightning": "TBL", "New York Rangers": "NYR", "New York Islanders": "NYI",
  "New Jersey Devils": "NJD", "Pittsburgh Penguins": "PIT", "Washington Capitals": "WSH",
  "Columbus Blue Jackets": "CBJ", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
  "Detroit Red Wings": "DET", "Philadelphia Flyers": "PHI", "Anaheim Ducks": "ANA",
  "Los Angeles Kings": "LAK", "San Jose Sharks": "SJS", "Seattle Kraken": "SEA",
  "Chicago Blackhawks": "CHI", "Utah Hockey Club": "UHC",
  "New York Yankees": "NYY", "New York Mets": "NYM", "Boston Red Sox": "BOS",
  "Houston Astros": "HOU", "Los Angeles Dodgers": "LAD", "Los Angeles Angels": "LAA",
  "Chicago Cubs": "CHC", "Chicago White Sox": "CWS", "San Francisco Giants": "SF",
  "Atlanta Braves": "ATL", "Philadelphia Phillies": "PHI", "San Diego Padres": "SD",
  "Texas Rangers": "TEX", "Seattle Mariners": "SEA", "Toronto Blue Jays": "TOR",
  "Tampa Bay Rays": "TB", "Baltimore Orioles": "BAL", "Cleveland Guardians": "CLE",
  "Minnesota Twins": "MIN", "Detroit Tigers": "DET", "Milwaukee Brewers": "MIL",
  "St. Louis Cardinals": "STL", "Cincinnati Reds": "CIN", "Pittsburgh Pirates": "PIT",
  "Kansas City Royals": "KC", "Arizona Diamondbacks": "ARI", "Colorado Rockies": "COL",
  "Miami Marlins": "MIA", "Washington Nationals": "WSH", "Oakland Athletics": "OAK",
};

function getAbbr(name: string): string {
  return TEAM_ABBR[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("THE_ODDS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THE_ODDS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const dateParam = url.searchParams.get("date"); // ISO format: 2024-01-15T00:00:00Z
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dateParam) {
      return new Response(
        JSON.stringify({ error: "date parameter required (ISO format, e.g. 2024-01-15T00:00:00Z)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const snapshotDate = dateParam.split("T")[0]; // YYYY-MM-DD

    // Step 1: Fetch historical events for that date
    const eventsUrl = `${THE_ODDS_API_BASE}/historical/sports/${sportKey}/events?apiKey=${apiKey}&date=${dateParam}`;
    const eventsResp = await fetch(eventsUrl);

    if (!eventsResp.ok) {
      const body = await eventsResp.text();
      return new Response(
        JSON.stringify({ error: `Historical events error: ${eventsResp.status}`, details: body.slice(0, 300) }),
        { status: eventsResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventsData = await eventsResp.json();
    const events = eventsData.data || eventsData || [];
    const remaining = eventsResp.headers.get("x-requests-remaining");
    console.log(`[Historical] Found ${Array.isArray(events) ? events.length : 0} events for ${league} on ${snapshotDate}. Remaining: ${remaining}`);

    if (!Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events_found: 0, odds_stored: 0, api_remaining: remaining }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch historical odds for that date
    await delay(1200); // Respect rate limits

    const oddsUrl = `${THE_ODDS_API_BASE}/historical/sports/${sportKey}/odds?apiKey=${apiKey}&date=${dateParam}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const oddsResp = await fetch(oddsUrl);

    if (!oddsResp.ok) {
      const body = await oddsResp.text();
      return new Response(
        JSON.stringify({ error: `Historical odds error: ${oddsResp.status}`, details: body.slice(0, 300) }),
        { status: oddsResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const oddsData = await oddsResp.json();
    const oddsEvents = oddsData.data || oddsData || [];
    const oddsRemaining = oddsResp.headers.get("x-requests-remaining");

    // Step 3: Parse and store historical odds
    const rows: any[] = [];

    for (const event of (Array.isArray(oddsEvents) ? oddsEvents : [])) {
      const homeTeam = event.home_team || "";
      const awayTeam = event.away_team || "";
      const eventId = event.id || "";
      const startTime = event.commence_time || dateParam;

      // Try to match to existing game
      const { data: gameMatch } = await supabase
        .from("games")
        .select("id")
        .eq("external_id", eventId)
        .maybeSingle();

      for (const bk of event.bookmakers || []) {
        for (const market of bk.markets || []) {
          const homeOut = market.outcomes?.find((o: any) => o.name === homeTeam);
          const awayOut = market.outcomes?.find((o: any) => o.name === awayTeam);
          const overOut = market.outcomes?.find((o: any) => o.name === "Over");
          const underOut = market.outcomes?.find((o: any) => o.name === "Under");

          let marketType = "unknown";
          let homePrice: number | null = null;
          let awayPrice: number | null = null;
          let line: number | null = null;

          if (market.key === "h2h") {
            marketType = "moneyline";
            homePrice = homeOut?.price ?? null;
            awayPrice = awayOut?.price ?? null;
          } else if (market.key === "spreads") {
            marketType = "spread";
            homePrice = homeOut?.price ?? null;
            awayPrice = awayOut?.price ?? null;
            line = homeOut?.point ?? null;
          } else if (market.key === "totals") {
            marketType = "total";
            homePrice = overOut?.price ?? null;
            awayPrice = underOut?.price ?? null;
            line = overOut?.point ?? null;
          }

          rows.push({
            game_id: gameMatch?.id || null,
            external_event_id: eventId,
            league,
            home_team: homeTeam,
            away_team: awayTeam,
            start_time: startTime,
            market_type: marketType,
            bookmaker: bk.key,
            home_price: homePrice,
            away_price: awayPrice,
            line,
            snapshot_date: snapshotDate,
          });
        }
      }
    }

    // Batch insert
    let storedCount = 0;
    // Delete existing data for this league+date to avoid duplicates
    await supabase
      .from("historical_odds")
      .delete()
      .eq("league", league)
      .eq("snapshot_date", snapshotDate);

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from("historical_odds").insert(chunk);
      if (error) {
        console.error(`Historical odds insert error at offset ${i}:`, error.message);
      } else {
        storedCount += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        league,
        snapshot_date: snapshotDate,
        events_found: Array.isArray(events) ? events.length : 0,
        odds_stored: storedCount,
        bookmakers_seen: rows.length,
        api_remaining: oddsRemaining || remaining,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-historical-odds error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
