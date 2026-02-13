import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

// Sport keys for The Odds API
const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NCAAB: "basketball_ncaab",
  NCAAF: "americanfootball_ncaaf",
};

// Team abbreviation mapping (common ones)
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
    // NFL
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
    "Arizona Coyotes": "ARI", "Chicago Blackhawks": "CHI", "Utah Hockey Club": "UHC",
  };
  return map[name] || name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

function leagueFromSportKey(sportKey: string): string {
  for (const [league, key] of Object.entries(SPORT_KEYS)) {
    if (key === sportKey) return league;
  }
  return sportKey.toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("THE_ODDS_API_KEY");
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "THE_ODDS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const sports = url.searchParams.get("sports") || "NBA,NFL,MLB,NHL";
    const sportsList = sports.split(",").map(s => s.trim().toUpperCase());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const allGames: any[] = [];
    let requestsRemaining: string | null = null;

    for (const league of sportsList) {
      const sportKey = SPORT_KEYS[league];
      if (!sportKey) continue;

      const oddsUrl = `${ODDS_API_BASE}/sports/${sportKey}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
      
      const resp = await fetch(oddsUrl);
      requestsRemaining = resp.headers.get("x-requests-remaining");

      if (!resp.ok) {
        console.error(`Odds API error for ${league}: ${resp.status}`);
        continue;
      }

      const events = await resp.json();

      for (const event of events) {
        // Find best bookmaker odds (use first available)
        let mlHome = 0, mlAway = 0;
        let spreadLine = 0, spreadHome = -110, spreadAway = -110;
        let totalLine = 0, totalOver = -110, totalUnder = -110;

        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            if (market.key === "h2h") {
              const homeOutcome = market.outcomes.find((o: any) => o.name === event.home_team);
              const awayOutcome = market.outcomes.find((o: any) => o.name === event.away_team);
              if (homeOutcome && !mlHome) mlHome = homeOutcome.price;
              if (awayOutcome && !mlAway) mlAway = awayOutcome.price;
            }
            if (market.key === "spreads") {
              const homeOutcome = market.outcomes.find((o: any) => o.name === event.home_team);
              const awayOutcome = market.outcomes.find((o: any) => o.name === event.away_team);
              if (homeOutcome && !spreadLine) {
                spreadLine = homeOutcome.point;
                spreadHome = homeOutcome.price;
              }
              if (awayOutcome) spreadAway = awayOutcome.price;
            }
            if (market.key === "totals") {
              const over = market.outcomes.find((o: any) => o.name === "Over");
              const under = market.outcomes.find((o: any) => o.name === "Under");
              if (over && !totalLine) {
                totalLine = over.point;
                totalOver = over.price;
              }
              if (under) totalUnder = under.price;
            }
          }
        }

        // Upsert game
        const gameData = {
          external_id: event.id,
          league,
          home_team: event.home_team,
          away_team: event.away_team,
          home_abbr: makeAbbr(event.home_team),
          away_abbr: makeAbbr(event.away_team),
          start_time: event.commence_time,
          status: "scheduled",
        };

        const { data: existingGame } = await supabase
          .from("games")
          .select("id")
          .eq("external_id", event.id)
          .maybeSingle();

        let gameId: string;

        if (existingGame) {
          gameId = existingGame.id;
          await supabase
            .from("games")
            .update(gameData)
            .eq("id", gameId);
        } else {
          const { data: newGame } = await supabase
            .from("games")
            .insert(gameData)
            .select("id")
            .single();
          gameId = newGame!.id;
        }

        // Store odds snapshots for each bookmaker
        const snapshots: any[] = [];
        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            const homeOutcome = market.outcomes.find(
              (o: any) => o.name === event.home_team || o.name === "Over"
            );
            const awayOutcome = market.outcomes.find(
              (o: any) => o.name === event.away_team || o.name === "Under"
            );

            snapshots.push({
              game_id: gameId,
              bookmaker: bookmaker.key,
              market_type: market.key === "h2h" ? "moneyline" : market.key === "spreads" ? "spread" : "total",
              home_price: homeOutcome?.price || null,
              away_price: awayOutcome?.price || null,
              line: homeOutcome?.point || awayOutcome?.point || null,
            });
          }
        }

        if (snapshots.length > 0) {
          await supabase.from("odds_snapshots").insert(snapshots);
        }

        allGames.push({
          id: gameId,
          ...gameData,
          odds: {
            moneyline: { home: mlHome, away: mlAway },
            spread: { home: spreadHome, away: spreadAway, line: spreadLine },
            total: { over: totalOver, under: totalUnder, line: totalLine },
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        games: allGames,
        requests_remaining: requestsRemaining,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-odds error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
