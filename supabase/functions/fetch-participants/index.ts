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
  NCAAB: "basketball_ncaab",
  NCAAF: "americanfootball_ncaaf",
};

// Map Odds API team names to standard abbreviations
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
  // NHL
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
  // MLB
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
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch participants (rosters) from The Odds API
    const participantsUrl = `${THE_ODDS_API_BASE}/sports/${sportKey}/participants?apiKey=${apiKey}`;
    const resp = await fetch(participantsUrl);

    if (!resp.ok) {
      const body = await resp.text();
      return new Response(
        JSON.stringify({ error: `Participants API error: ${resp.status}`, details: body.slice(0, 300) }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remaining = resp.headers.get("x-requests-remaining");
    const data = await resp.json();

    // The participants endpoint returns teams with players
    // Structure: array of { id, name, players: [{ id, name, ... }] }
    let playersUpserted = 0;
    let teamsProcessed = 0;
    const batchSize = 50;

    for (const team of data) {
      const teamName = team.name || "";
      const teamAbbr = getAbbr(teamName);
      teamsProcessed++;

      const players = team.players || [];
      if (players.length === 0) continue;

      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);
        const records = batch.map((p: any) => ({
          name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          team: teamAbbr,
          league,
          position: p.position || null,
          // The Odds API participant IDs are unique per provider
          external_id: p.id ? `oddsapi_${p.id}` : null,
        }));

        // Upsert by name + team to avoid duplicates
        for (const record of records) {
          if (!record.name) continue;

          // Check if player exists by name + team
          const { data: existing } = await supabase
            .from("players")
            .select("id")
            .eq("name", record.name)
            .eq("team", record.team)
            .maybeSingle();

          if (existing) {
            // Update team assignment if changed
            await supabase
              .from("players")
              .update({ team: record.team, league: record.league, position: record.position })
              .eq("id", existing.id);
          } else {
            const { error } = await supabase.from("players").insert(record);
            if (error && !error.message.includes("duplicate")) {
              console.error(`Insert error for ${record.name}:`, error.message);
            }
          }
          playersUpserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        league,
        teams_processed: teamsProcessed,
        players_upserted: playersUpserted,
        api_remaining: remaining,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-participants error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
