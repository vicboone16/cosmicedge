// SGO Live & Upcoming Events Poller
// Fetches from /stream/events (seed data) and /events (full data) endpoints
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";
const BATCH = 100;

function makeAbbr(name: string): string {
  const map: Record<string, string> = {
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
    "Kansas City Chiefs": "KC", "Buffalo Bills": "BUF", "Miami Dolphins": "MIA",
    "New England Patriots": "NE", "Baltimore Ravens": "BAL", "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE", "Pittsburgh Steelers": "PIT", "Houston Texans": "HOU",
    "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Tennessee Titans": "TEN",
    "Denver Broncos": "DEN", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Dallas Cowboys": "DAL", "New York Giants": "NYG", "Philadelphia Eagles": "PHI",
    "Washington Commanders": "WSH", "Chicago Bears": "CHI", "Detroit Lions": "DET",
    "Green Bay Packers": "GB", "Minnesota Vikings": "MIN", "Atlanta Falcons": "ATL",
    "Carolina Panthers": "CAR", "New Orleans Saints": "NO", "Tampa Bay Buccaneers": "TB",
    "Arizona Cardinals": "ARI", "Los Angeles Rams": "LAR", "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA", "New York Jets": "NYJ",
  };
  return map[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

function sgoTeamName(teamID: string): string {
  if (!teamID) return "Unknown";
  const parts = teamID.replace(/_NBA$|_NFL$|_MLB$|_NHL$/i, "").split("_");
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

async function fetchWithRetry(url: string, apiKey: string, maxRetries = 2): Promise<any | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (resp.status === 429) {
      const wait = Math.min(parseInt(resp.headers.get("retry-after") || "5", 10) * 1000, 15000);
      console.warn(`SGO 429 — waiting ${wait}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`SGO error ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }
    return await resp.json();
  }
  console.error("SGO: max retries exceeded");
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    if (!apiKey) throw new Error("SPORTSGAMEODDS_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const feed = url.searchParams.get("feed") || "events:live"; // events:live | events:upcoming
    const league = url.searchParams.get("league") || "";

    // Step 1: Get stream seed data
    const streamParams = new URLSearchParams({ feed });
    if (league) streamParams.set("leagueID", league);
    const streamData = await fetchWithRetry(
      `${SGO_BASE}/stream/events?${streamParams}`,
      apiKey
    );

    if (!streamData?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, feed, events_found: 0, games_upserted: 0, snapshots_stored: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = streamData.data;
    console.log(`[SGO-Live] ${feed}: ${events.length} events found`);

    // Step 2: Process events → upsert games + store odds snapshots
    let gamesUpserted = 0;
    let snapshotsStored = 0;

    for (const event of events) {
      const eventLeague = event.leagueID || "";
      const homeTeamID = event.teams?.home?.teamID || "";
      const awayTeamID = event.teams?.away?.teamID || "";
      const homeTeam = event.teams?.home?.names?.full || sgoTeamName(homeTeamID);
      const awayTeam = event.teams?.away?.names?.full || sgoTeamName(awayTeamID);
      const homeAbbr = event.teams?.home?.names?.short || event.teams?.home?.names?.abbreviation || makeAbbr(homeTeam);
      const awayAbbr = event.teams?.away?.names?.short || event.teams?.away?.names?.abbreviation || makeAbbr(awayTeam);
      const startTime = event.start || event.startTime || event.startDate || null;
      const status = event.live ? "live" : event.finalized ? "final" : "scheduled";

      if (!startTime || isNaN(new Date(startTime).getTime())) continue;

      // Upsert game
      const externalId = `sgo_${event.eventID || event.id}`;
      const gameData = {
        external_id: externalId,
        league: eventLeague,
        home_team: homeTeam,
        away_team: awayTeam,
        home_abbr: homeAbbr,
        away_abbr: awayAbbr,
        start_time: startTime,
        status,
        source: "sgo",
      };

      const { data: existing } = await supabase
        .from("games")
        .select("id")
        .eq("external_id", externalId)
        .maybeSingle();

      let gameId: string;
      if (existing) {
        gameId = existing.id;
        await supabase.from("games").update({ ...gameData, updated_at: new Date().toISOString() }).eq("id", gameId);
      } else {
        // Check by team + time window
        const t = new Date(startTime).getTime();
        const { data: matchByTeam } = await supabase
          .from("games")
          .select("id")
          .eq("home_team", homeTeam)
          .eq("away_team", awayTeam)
          .gte("start_time", new Date(t - 3600000).toISOString())
          .lte("start_time", new Date(t + 3600000).toISOString())
          .maybeSingle();

        if (matchByTeam) {
          gameId = matchByTeam.id;
          await supabase.from("games").update(gameData).eq("id", gameId);
        } else {
          const { data: newGame } = await supabase.from("games").insert(gameData).select("id").single();
          gameId = newGame!.id;
        }
      }
      gamesUpserted++;

      // Update live scores if available
      if (event.score) {
        const homeScore = event.score?.home?.total ?? event.score?.home ?? null;
        const awayScore = event.score?.away?.total ?? event.score?.away ?? null;
        if (homeScore != null || awayScore != null) {
          await supabase.from("games").update({ home_score: homeScore, away_score: awayScore }).eq("id", gameId);
        }
      }

      // Parse odds into snapshots
      const snapshots: any[] = [];
      const odds = event.odds || {};
      for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
        let marketType = "unknown";
        let homePrice: number | null = null;
        let awayPrice: number | null = null;
        let line: number | null = null;

        if (oddID.includes("-ml-home")) {
          marketType = "moneyline";
          homePrice = oddData.odds ?? null;
        } else if (oddID.includes("-ml-away")) {
          marketType = "moneyline";
          awayPrice = oddData.odds ?? null;
        } else if (oddID.includes("-sp-home")) {
          marketType = "spread";
          homePrice = oddData.odds ?? null;
          line = oddData.spread ?? null;
        } else if (oddID.includes("-sp-away")) {
          marketType = "spread";
          awayPrice = oddData.odds ?? null;
          line = oddData.spread ?? null;
        } else if (oddID.includes("-ou-over")) {
          marketType = "total";
          homePrice = oddData.odds ?? null;
          line = oddData.overUnder ?? oddData.spread ?? null;
        } else if (oddID.includes("-ou-under")) {
          marketType = "total";
          awayPrice = oddData.odds ?? null;
          line = oddData.overUnder ?? oddData.spread ?? null;
        } else {
          continue;
        }

        // Store consensus
        snapshots.push({
          game_id: gameId,
          bookmaker: "sgo_consensus",
          market_type: marketType,
          home_price: homePrice,
          away_price: awayPrice,
          line,
        });

        // Store per-bookmaker if available
        if (oddData.byBookmaker) {
          for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
            snapshots.push({
              game_id: gameId,
              bookmaker: `sgo_${bk}`,
              market_type: marketType,
              home_price: marketType === "moneyline" && oddID.includes("home") ? bkData.odds : (marketType !== "moneyline" && oddID.includes("over") ? bkData.odds : null),
              away_price: marketType === "moneyline" && oddID.includes("away") ? bkData.odds : (marketType !== "moneyline" && oddID.includes("under") ? bkData.odds : null),
              line: bkData.spread ?? bkData.overUnder ?? line,
            });
          }
        }
      }

      // Batch insert snapshots
      for (let i = 0; i < snapshots.length; i += BATCH) {
        const chunk = snapshots.slice(i, i + BATCH);
        const { error } = await supabase.from("odds_snapshots").insert(chunk);
        if (error) console.error("Snapshot insert error:", error.message);
        else snapshotsStored += chunk.length;
      }

      // Attach stadium coords
      const { data: stadium } = await supabase
        .from("stadiums")
        .select("name, latitude, longitude")
        .eq("team_abbr", homeAbbr)
        .eq("league", eventLeague)
        .maybeSingle();

      if (stadium) {
        await supabase.from("games").update({
          venue: stadium.name,
          venue_lat: stadium.latitude,
          venue_lng: stadium.longitude,
        }).eq("id", gameId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        feed,
        events_found: events.length,
        games_upserted: gamesUpserted,
        snapshots_stored: snapshotsStored,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-sgo-live error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
