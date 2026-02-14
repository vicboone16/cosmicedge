// SGO Live & Upcoming Events Poller
// Uses shared SGO types for proper API model normalization
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RawEvent } from "../_shared/sgo-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";
const BATCH = 100;

// ---------------------------------------------------------------------------
// Team abbreviation helpers
// ---------------------------------------------------------------------------

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

function makeAbbr(name: string): string {
  return TEAM_ABBR_MAP[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

function sgoTeamName(teamID: string): string {
  if (!teamID) return "Unknown";
  const parts = teamID.replace(/_NBA$|_NFL$|_MLB$|_NHL$/i, "").split("_");
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

// ---------------------------------------------------------------------------
// Fetch with retry (429 handling)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Extract team info from a RawEvent using proper SGO field names
// ---------------------------------------------------------------------------

function extractTeamInfo(event: RawEvent) {
  const homeTeamID = event.teams?.home?.teamID || "";
  const awayTeamID = event.teams?.away?.teamID || "";
  const homeTeam = event.teams?.home?.names?.long || event.teams?.home?.names?.medium || sgoTeamName(homeTeamID);
  const awayTeam = event.teams?.away?.names?.long || event.teams?.away?.names?.medium || sgoTeamName(awayTeamID);
  const homeAbbr = event.teams?.home?.names?.short || makeAbbr(homeTeam);
  const awayAbbr = event.teams?.away?.names?.short || makeAbbr(awayTeam);
  return { homeTeam, awayTeam, homeAbbr, awayAbbr };
}

// ---------------------------------------------------------------------------
// Determine game status from RawEventStatus
// ---------------------------------------------------------------------------

function resolveStatus(event: RawEvent): string {
  if (event.status?.live) return "live";
  if (event.status?.finalized) return "final";
  if (event.status?.cancelled) return "cancelled";
  if (event.status?.delayed) return "delayed";
  // Fallback for stream/seed events without full status
  if ((event as any).live) return "live";
  if ((event as any).finalized) return "final";
  return "scheduled";
}

// ---------------------------------------------------------------------------
// Extract scores – prefer status.results, fall back to teams.home/away.score
// ---------------------------------------------------------------------------

function extractScores(event: RawEvent): { home: number | null; away: number | null } {
  // teams.home.score / teams.away.score is the simplest path
  const homeScore = event.teams?.home?.score ?? null;
  const awayScore = event.teams?.away?.score ?? null;
  if (homeScore != null || awayScore != null) {
    return { home: homeScore, away: awayScore };
  }
  return { home: null, away: null };
}

// ---------------------------------------------------------------------------
// Extract current period info for game_state_snapshots
// ---------------------------------------------------------------------------

function extractPeriodInfo(event: RawEvent) {
  const periodId = event.status?.currentPeriodID ?? event.currentPeriodID ?? null;
  const displayShort = event.status?.displayShort ?? null;
  return { periodId, displayShort };
}

// ---------------------------------------------------------------------------
// Parse odds from the event.odds map
// ---------------------------------------------------------------------------

function parseOddsSnapshots(odds: Record<string, unknown>, gameId: string) {
  const snapshots: any[] = [];

  for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
    let marketType = "unknown";
    let homePrice: number | null = null;
    let awayPrice: number | null = null;
    let line: number | null = null;

    if (oddID.includes("-ml-home")) {
      marketType = "moneyline"; homePrice = oddData.odds ?? null;
    } else if (oddID.includes("-ml-away")) {
      marketType = "moneyline"; awayPrice = oddData.odds ?? null;
    } else if (oddID.includes("-sp-home")) {
      marketType = "spread"; homePrice = oddData.odds ?? null; line = oddData.spread ?? null;
    } else if (oddID.includes("-sp-away")) {
      marketType = "spread"; awayPrice = oddData.odds ?? null; line = oddData.spread ?? null;
    } else if (oddID.includes("-ou-over")) {
      marketType = "total"; homePrice = oddData.odds ?? null; line = oddData.overUnder ?? oddData.spread ?? null;
    } else if (oddID.includes("-ou-under")) {
      marketType = "total"; awayPrice = oddData.odds ?? null; line = oddData.overUnder ?? oddData.spread ?? null;
    } else {
      continue;
    }

    // Consensus
    snapshots.push({ game_id: gameId, bookmaker: "sgo_consensus", market_type: marketType, home_price: homePrice, away_price: awayPrice, line });

    // Per-bookmaker
    if (oddData.byBookmaker) {
      for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
        snapshots.push({
          game_id: gameId,
          bookmaker: `sgo_${bk}`,
          market_type: marketType,
          home_price: (marketType === "moneyline" && oddID.includes("home")) || (marketType !== "moneyline" && oddID.includes("over")) ? bkData.odds : null,
          away_price: (marketType === "moneyline" && oddID.includes("away")) || (marketType !== "moneyline" && oddID.includes("under")) ? bkData.odds : null,
          line: bkData.spread ?? bkData.overUnder ?? line,
        });
      }
    }
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    if (!apiKey) throw new Error("SPORTSGAMEODDS_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const feed = url.searchParams.get("feed") || "events:live";
    const league = url.searchParams.get("league") || "NBA,NFL,MLB,NHL";

    // Step 1: Get stream seed data
    const streamParams = new URLSearchParams({ feed, leagueID: league });
    const streamData = await fetchWithRetry(`${SGO_BASE}/stream/events?${streamParams}`, apiKey);

    if (!streamData?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, feed, events_found: 0, games_upserted: 0, odds_snapshots_stored: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const events: RawEvent[] = streamData.data;
    console.log(`[SGO-Live] ${feed}: ${events.length} events found`);

    // Step 2: Process each event
    let gamesUpserted = 0;
    let snapshotsStored = 0;
    let stateSnapshotsStored = 0;

    for (const event of events) {
      const eventLeague = event.leagueID || "";
      const { homeTeam, awayTeam, homeAbbr, awayAbbr } = extractTeamInfo(event);

      // Resolve start time
      const startTime = event.status?.startsAt ?? (event as any).start ?? (event as any).startTime ?? null;
      if (!startTime || isNaN(new Date(startTime).getTime())) continue;

      const status = resolveStatus(event);
      const externalId = `sgo_${event.eventID}`;

      // Upsert game
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
        .from("games").select("id").eq("external_id", externalId).maybeSingle();

      let gameId: string;
      if (existing) {
        gameId = existing.id;
        await supabase.from("games").update({ ...gameData, updated_at: new Date().toISOString() }).eq("id", gameId);
      } else {
        const t = new Date(startTime).getTime();
        const { data: matchByTeam } = await supabase
          .from("games").select("id")
          .eq("home_team", homeTeam).eq("away_team", awayTeam)
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

      // Update scores
      const scores = extractScores(event);
      if (scores.home != null || scores.away != null) {
        await supabase.from("games").update({ home_score: scores.home, away_score: scores.away }).eq("id", gameId);
      }

      // Store game_state_snapshot for live/final games (real-time timeline)
      if (status === "live" || status === "final") {
        const { periodId, displayShort } = extractPeriodInfo(event);
        const { error: snapErr } = await supabase.from("game_state_snapshots").insert({
          game_id: gameId,
          status,
          home_score: scores.home,
          away_score: scores.away,
          quarter: periodId ? String(periodId) : null,
          clock: displayShort,
        });
        if (!snapErr) stateSnapshotsStored++;
      }

      // Parse & store odds snapshots
      if (event.odds && typeof event.odds === "object") {
        const oddsSnaps = parseOddsSnapshots(event.odds as Record<string, unknown>, gameId);
        for (let i = 0; i < oddsSnaps.length; i += BATCH) {
          const chunk = oddsSnaps.slice(i, i + BATCH);
          const { error } = await supabase.from("odds_snapshots").insert(chunk);
          if (error) console.error("Snapshot insert error:", error.message);
          else snapshotsStored += chunk.length;
        }
      }

      // Attach stadium coords
      const { data: stadium } = await supabase
        .from("stadiums").select("name, latitude, longitude")
        .eq("team_abbr", homeAbbr).eq("league", eventLeague).maybeSingle();

      if (stadium) {
        await supabase.from("games").update({
          venue: stadium.name, venue_lat: stadium.latitude, venue_lng: stadium.longitude,
        }).eq("id", gameId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        feed,
        events_found: events.length,
        games_upserted: gamesUpserted,
        odds_snapshots_stored: snapshotsStored,
        state_snapshots_stored: stateSnapshotsStored,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-sgo-live error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
