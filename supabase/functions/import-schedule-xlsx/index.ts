import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// NFL team name → abbreviation
const NFL_TEAMS: Record<string, string> = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
  "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

// NHL team name → abbreviation
const NHL_TEAMS: Record<string, string> = {
  "Anaheim Ducks": "ANA", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR", "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ", "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM", "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montréal Canadiens": "MTL",
  "Montreal Canadiens": "MTL", "Nashville Predators": "NSH", "New Jersey Devils": "NJD",
  "New York Islanders": "NYI", "New York Rangers": "NYR", "Ottawa Senators": "OTT",
  "Philadelphia Flyers": "PHI", "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS",
  "Seattle Kraken": "SEA", "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR", "Utah Hockey Club": "UTA", "Vancouver Canucks": "VAN",
  "Vegas Golden Knights": "VGK", "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
};

// MLB team name → abbreviation
const MLB_TEAMS: Record<string, string> = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Athletics": "OAK", "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD",
  "San Francisco Giants": "SF", "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB", "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function detectLeague(homeTeamId: number): string | null {
  if (homeTeamId >= 2000 && homeTeamId < 3000) return "NFL";
  if (homeTeamId >= 3000 && homeTeamId < 4000) return "NHL";
  if (homeTeamId >= 4000 && homeTeamId < 5000) return "MLB";
  return null;
}

const LEAGUE_ABBR: Record<string, Record<string, string>> = {
  NFL: NFL_TEAMS, NHL: NHL_TEAMS, MLB: MLB_TEAMS,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    let fileData: Uint8Array;

    if (body.storage_path) {
      // Download from Supabase storage
      const { data, error } = await supabase.storage
        .from(body.bucket || "csv-imports")
        .download(body.storage_path);
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Storage download failed: ${error?.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      fileData = new Uint8Array(await data.arrayBuffer());
    } else if (body.url) {
      const res = await fetch(body.url);
      fileData = new Uint8Array(await res.arrayBuffer());
    } else {
      return new Response(
        JSON.stringify({ error: "Provide storage_path or url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workbook = XLSX.read(fileData, { type: "array" });
    const log: string[] = [];
    let totalInserted = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    // Pre-fetch stadiums for venue lookup
    const { data: stadiums } = await supabase
      .from("stadiums")
      .select("name, latitude, longitude");
    const stadiumMap = new Map(
      (stadiums || []).map((s: any) => [s.name, s])
    );

    // Process each sheet (skip non-schedule sheets like "Venues" or notes)
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0 || !rows[0].gameId) {
        log.push(`Skipping sheet "${sheetName}" — no gameId column`);
        continue;
      }

      log.push(`Processing sheet "${sheetName}": ${rows.length} rows`);

      // Group by league
      const leagueRows: Record<string, any[]> = {};
      for (const row of rows) {
        const homeId = Number(row.hometeamId || row.homeTeamId);
        const league = detectLeague(homeId);
        if (!league) continue;

        const homeName = row.homeTeamName;
        const awayName = row.awayTeamName;
        const teamMap = LEAGUE_ABBR[league];
        if (!teamMap || !teamMap[homeName] || !teamMap[awayName]) continue;

        // Skip preseason
        if (row.gameLabel === "Preseason") continue;

        if (!leagueRows[league]) leagueRows[league] = [];

        // Parse datetime
        const dtStr = String(row.gameDateTimeEst || "");
        let startTime: string;
        if (dtStr.includes("+") || dtStr.includes("Z")) {
          startTime = new Date(dtStr).toISOString();
        } else {
          startTime = new Date(dtStr.replace(" ", "T") + "-05:00").toISOString();
        }

        const stadium = stadiumMap.get(row.arenaName || row.venueName);
        const venueLat = Number(row.venueLatitude) || stadium?.latitude || null;
        const venueLng = Number(row.venueLongitude) || stadium?.longitude || null;

        leagueRows[league].push({
          external_id: String(row.gameId),
          league,
          home_team: homeName,
          away_team: awayName,
          home_abbr: teamMap[homeName],
          away_abbr: teamMap[awayName],
          start_time: startTime,
          status: "scheduled",
          venue: row.arenaName || row.venueName || null,
          venue_lat: venueLat,
          venue_lng: venueLng,
          source: `${league.toLowerCase()}_schedule`,
        });
      }

      // Insert each league
      for (const [league, games] of Object.entries(leagueRows)) {
        log.push(`${league}: ${games.length} games to process`);

        // Check existing
        const existingSet = new Set<string>();
        for (let i = 0; i < games.length; i += 500) {
          const batch = games.slice(i, i + 500).map(g => g.external_id);
          const { data: existing } = await supabase
            .from("games")
            .select("external_id")
            .in("external_id", batch);
          (existing || []).forEach((e: any) => existingSet.add(e.external_id));
        }

        const newGames = games.filter(g => !existingSet.has(g.external_id));
        const skipped = games.length - newGames.length;
        totalSkipped += skipped;
        log.push(`${league}: ${newGames.length} new, ${skipped} already exist`);

        // Insert in batches of 100
        for (let i = 0; i < newGames.length; i += 100) {
          const batch = newGames.slice(i, i + 100);
          const { data, error } = await supabase
            .from("games")
            .insert(batch)
            .select("id");
          if (error) {
            allErrors.push(`${league} batch ${i}: ${error.message}`);
            log.push(`❌ ${league} batch ${i}: ${error.message}`);
          } else {
            const count = data?.length || batch.length;
            totalInserted += count;
          }
        }

        log.push(`✅ ${league}: inserted ${newGames.length} games`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: totalInserted,
        skipped: totalSkipped,
        errors: allErrors.slice(0, 20),
        log,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message, stack: e.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
