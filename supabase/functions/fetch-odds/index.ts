import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Team abbreviation helper ───
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

// ─── Normalized game type ───
interface NormalizedGame {
  external_id: string;
  league: string;
  home_team: string;
  away_team: string;
  home_abbr: string;
  away_abbr: string;
  start_time: string | null;
  status: string;
  venue?: string;
  odds: {
    moneyline: { home: number; away: number };
    spread: { home: number; away: number; line: number };
    total: { over: number; under: number; line: number };
  };
  snapshots: {
    bookmaker: string;
    market_type: string;
    home_price: number | null;
    away_price: number | null;
    line: number | null;
  }[];
}

// ═══════════════════════════════════════════════
// PROVIDER 1: The Odds API
// ═══════════════════════════════════════════════
const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const THE_ODDS_SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba", NFL: "americanfootball_nfl",
  MLB: "baseball_mlb", NHL: "icehockey_nhl",
  NCAAB: "basketball_ncaab", NCAAF: "americanfootball_ncaaf",
};

async function fetchFromTheOddsAPI(apiKey: string, leagues: string[]): Promise<{ games: NormalizedGame[]; remaining: string | null }> {
  const allGames: NormalizedGame[] = [];
  let remaining: string | null = null;

  for (const league of leagues) {
    const sportKey = THE_ODDS_SPORT_KEYS[league];
    if (!sportKey) continue;

    // Start with base markets; premium markets (team_totals, alternate_spreads, alternate_totals)
    // require a higher subscription tier and cause 422 errors on standard plans
    let url = `${THE_ODDS_API_BASE}/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const resp = await fetch(url);
    remaining = resp.headers.get("x-requests-remaining");

    if (!resp.ok) {
      console.error(`TheOddsAPI error for ${league}: ${resp.status}`);
      continue;
    }

    const events = await resp.json();

    for (const event of events) {
      let mlHome = 0, mlAway = 0;
      let spreadLine = 0, spreadHome = -110, spreadAway = -110;
      let totalLine = 0, totalOver = -110, totalUnder = -110;
      const snapshots: NormalizedGame["snapshots"] = [];

      for (const bk of event.bookmakers || []) {
        for (const market of bk.markets || []) {
          const homeOut = market.outcomes.find((o: any) => o.name === event.home_team);
          const awayOut = market.outcomes.find((o: any) => o.name === event.away_team);
          const overOut = market.outcomes.find((o: any) => o.name === "Over");
          const underOut = market.outcomes.find((o: any) => o.name === "Under");

          if (market.key === "h2h") {
            if (homeOut && !mlHome) mlHome = homeOut.price;
            if (awayOut && !mlAway) mlAway = awayOut.price;
            snapshots.push({ bookmaker: bk.key, market_type: "moneyline", home_price: homeOut?.price, away_price: awayOut?.price, line: null });
          }
          if (market.key === "spreads") {
            if (homeOut && !spreadLine) { spreadLine = homeOut.point; spreadHome = homeOut.price; }
            if (awayOut) spreadAway = awayOut.price;
            snapshots.push({ bookmaker: bk.key, market_type: "spread", home_price: homeOut?.price, away_price: awayOut?.price, line: homeOut?.point || null });
          }
          if (market.key === "totals") {
            if (overOut && !totalLine) { totalLine = overOut.point; totalOver = overOut.price; }
            if (underOut) totalUnder = underOut.price;
            snapshots.push({ bookmaker: bk.key, market_type: "total", home_price: overOut?.price, away_price: underOut?.price, line: overOut?.point || null });
          }
          // Additional base-tier markets
          if (market.key === "team_totals") {
            for (const out of market.outcomes || []) {
              const isOver = out.name === "Over";
              const teamSide = out.description === event.home_team ? "home" : "away";
              snapshots.push({
                bookmaker: bk.key,
                market_type: `team_total_${teamSide}`,
                home_price: isOver ? out.price : null,
                away_price: isOver ? null : out.price,
                line: out.point || null,
              });
            }
          }
          if (market.key === "alternate_spreads") {
            snapshots.push({
              bookmaker: bk.key,
              market_type: "alt_spread",
              home_price: homeOut?.price || null,
              away_price: awayOut?.price || null,
              line: homeOut?.point || null,
            });
          }
          if (market.key === "alternate_totals") {
            snapshots.push({
              bookmaker: bk.key,
              market_type: "alt_total",
              home_price: overOut?.price || null,
              away_price: underOut?.price || null,
              line: overOut?.point || null,
            });
          }
        }
      }

      allGames.push({
        external_id: event.id,
        league,
        home_team: event.home_team,
        away_team: event.away_team,
        home_abbr: makeAbbr(event.home_team),
        away_abbr: makeAbbr(event.away_team),
        start_time: event.commence_time,
        status: "scheduled",
        odds: {
          moneyline: { home: mlHome, away: mlAway },
          spread: { home: spreadHome, away: spreadAway, line: spreadLine },
          total: { over: totalOver, under: totalUnder, line: totalLine },
        },
        snapshots,
      });
    }
  }

  return { games: allGames, remaining };
}

// ═══════════════════════════════════════════════
// PROVIDER 2: SportsGameOdds API
// ═══════════════════════════════════════════════
const SGO_API_BASE = "https://api.sportsgameodds.com/v2";

// Convert SGO teamID like "OKLAHOMA_CITY_THUNDER_NBA" to display name
function sgoTeamName(teamID: string): string {
  if (!teamID) return "Unknown";
  // Remove league suffix
  const parts = teamID.replace(/_NBA$|_NFL$|_MLB$|_NHL$|_NCAAB$|_NCAAF$/i, "").split("_");
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function sgoTeamAbbr(teamID: string): string {
  const name = sgoTeamName(teamID);
  return makeAbbr(name);
}

async function fetchFromSportsGameOdds(apiKey: string, leagues: string[]): Promise<{ games: NormalizedGame[] }> {
  const allGames: NormalizedGame[] = [];
  const leagueParam = leagues.join(",");

  const fetchWithRetry = async (url: string, maxRetries = 2): Promise<Response | null> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("retry-after") || "5", 10);
        const waitMs = Math.min((retryAfter || 5) * 1000, 15000);
        console.warn(`SGO 429 rate limit — waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!resp.ok) {
        console.error(`SGO API error: ${resp.status} ${await resp.text()}`);
        return null;
      }
      return resp;
    }
    console.error("SGO API: max retries exceeded for rate limit");
    return null;
  };

  try {
    const url = `${SGO_API_BASE}/events?leagueID=${leagueParam}&oddsAvailable=true&finalized=false&limit=50`;
    const resp = await fetchWithRetry(url);
    if (!resp) return { games: [] };

    const json = await resp.json();
    const events = json.data || [];

    for (const event of events) {
      const league = event.leagueID || "";
      const homeTeamID = event.teams?.home?.teamID || "";
      const awayTeamID = event.teams?.away?.teamID || "";
      const homeTeam = event.teams?.home?.names?.full || event.teams?.home?.names?.medium || sgoTeamName(homeTeamID);
      const awayTeam = event.teams?.away?.names?.full || event.teams?.away?.names?.medium || sgoTeamName(awayTeamID);
      const homeAbbr = event.teams?.home?.names?.short || event.teams?.home?.names?.abbreviation || sgoTeamAbbr(homeTeamID);
      const awayAbbr = event.teams?.away?.names?.short || event.teams?.away?.names?.abbreviation || sgoTeamAbbr(awayTeamID);

      // Parse odds from the event.odds object
      let mlHome = 0, mlAway = 0;
      let spreadLine = 0, spreadHome = -110, spreadAway = -110;
      let totalLine = 0, totalOver = -110, totalUnder = -110;
      const snapshots: NormalizedGame["snapshots"] = [];

      const odds = event.odds || {};
      for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
        // Moneyline
        if (oddID.includes("-ml-home")) {
          mlHome = oddData.odds || 0;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "moneyline", home_price: bkData.odds || null, away_price: null, line: null });
            }
          }
        }
        if (oddID.includes("-ml-away")) {
          mlAway = oddData.odds || 0;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              const existing = snapshots.find(s => s.bookmaker === `sgo_${bk}` && s.market_type === "moneyline");
              if (existing) existing.away_price = bkData.odds || null;
              else snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "moneyline", home_price: null, away_price: bkData.odds || null, line: null });
            }
          }
        }
        // Spread
        if (oddID.includes("-sp-home")) {
          spreadHome = oddData.odds || -110;
          spreadLine = oddData.spread || oddData.overUnder || 0;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "spread", home_price: bkData.odds || null, away_price: null, line: bkData.spread || null });
            }
          }
        }
        if (oddID.includes("-sp-away")) {
          spreadAway = oddData.odds || -110;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              const existing = snapshots.find(s => s.bookmaker === `sgo_${bk}` && s.market_type === "spread");
              if (existing) existing.away_price = bkData.odds || null;
              else snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "spread", home_price: null, away_price: bkData.odds || null, line: bkData.spread || null });
            }
          }
        }
        // Total
        if (oddID.includes("-ou-over")) {
          totalOver = oddData.odds || -110;
          totalLine = oddData.overUnder || oddData.spread || 0;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "total", home_price: bkData.odds || null, away_price: null, line: bkData.overUnder || null });
            }
          }
        }
        if (oddID.includes("-ou-under")) {
          totalUnder = oddData.odds || -110;
          if (oddData.byBookmaker) {
            for (const [bk, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
              const existing = snapshots.find(s => s.bookmaker === `sgo_${bk}` && s.market_type === "total");
              if (existing) existing.away_price = bkData.odds || null;
              else snapshots.push({ bookmaker: `sgo_${bk}`, market_type: "total", home_price: null, away_price: bkData.odds || null, line: bkData.overUnder || null });
            }
          }
        }
      }

      const status = event.live ? "live" : event.finalized ? "final" : "scheduled";

      allGames.push({
        external_id: event.eventID || event.id,
        league,
        home_team: homeTeam,
        away_team: awayTeam,
        home_abbr: homeAbbr,
        away_abbr: awayAbbr,
        start_time: event.start || event.startTime || event.startDate || null,
        status,
        odds: {
          moneyline: { home: mlHome, away: mlAway },
          spread: { home: spreadHome, away: spreadAway, line: spreadLine },
          total: { over: totalOver, under: totalUnder, line: totalLine },
        },
        snapshots,
      });
    }
  } catch (err) {
    console.error("SGO fetch error:", err);
  }

  return { games: allGames };
}

// ═══════════════════════════════════════════════
// PROVIDER 3: SportsDataIO
// ═══════════════════════════════════════════════
const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const SDIO_SPORT_SLUGS: Record<string, string> = {
  NBA: "nba", NFL: "nfl", MLB: "mlb", NHL: "nhl",
};

async function fetchOddsFromSportsDataIO(apiKey: string, leagues: string[]): Promise<{ games: NormalizedGame[] }> {
  const allGames: NormalizedGame[] = [];
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (const league of leagues) {
    const slug = SDIO_SPORT_SLUGS[league];
    if (!slug) continue;

    try {
      const url = `${SDIO_API_BASE}/${slug}/odds/json/GameOddsByDate/${today}?key=${apiKey}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`SportsDataIO odds error for ${league}: ${resp.status}`);
        continue;
      }
      const games = await resp.json();

      for (const game of games) {
        let mlHome = 0, mlAway = 0;
        let spreadLine = 0, spreadHome = -110, spreadAway = -110;
        let totalLine = 0, totalOver = -110, totalUnder = -110;
        const snapshots: NormalizedGame["snapshots"] = [];

        // Parse pregame odds from the first available consensus line
        for (const odds of game.PregameOdds || []) {
          const bk = odds.Sportsbook?.Name || "consensus";

          if (odds.HomeMoneyLine != null && !mlHome) {
            mlHome = odds.HomeMoneyLine;
            mlAway = odds.AwayMoneyLine || 0;
          }
          snapshots.push({ bookmaker: `sdio_${bk}`, market_type: "moneyline", home_price: odds.HomeMoneyLine, away_price: odds.AwayMoneyLine, line: null });

          if (odds.HomePointSpread != null && !spreadLine) {
            spreadLine = odds.HomePointSpread;
            spreadHome = odds.HomePointSpreadPayout || -110;
            spreadAway = odds.AwayPointSpreadPayout || -110;
          }
          snapshots.push({ bookmaker: `sdio_${bk}`, market_type: "spread", home_price: odds.HomePointSpreadPayout, away_price: odds.AwayPointSpreadPayout, line: odds.HomePointSpread });

          if (odds.OverUnder != null && !totalLine) {
            totalLine = odds.OverUnder;
            totalOver = odds.OverPayout || -110;
            totalUnder = odds.UnderPayout || -110;
          }
          snapshots.push({ bookmaker: `sdio_${bk}`, market_type: "total", home_price: odds.OverPayout, away_price: odds.UnderPayout, line: odds.OverUnder });
        }

        const homeTeam = game.HomeTeamName || game.HomeTeam || "";
        const awayTeam = game.AwayTeamName || game.AwayTeam || "";
        const status = game.Status === "InProgress" ? "live" : game.Status === "Final" ? "final" : "scheduled";

        allGames.push({
          external_id: `sdio_${game.GameId || game.GameID}`,
          league,
          home_team: homeTeam,
          away_team: awayTeam,
          home_abbr: makeAbbr(homeTeam),
          away_abbr: makeAbbr(awayTeam),
          start_time: game.DateTime || game.Day || null,
          status,
          venue: game.StadiumDetails?.Name || game.Stadium || undefined,
          odds: {
            moneyline: { home: mlHome, away: mlAway },
            spread: { home: spreadHome, away: spreadAway, line: spreadLine },
            total: { over: totalOver, under: totalUnder, line: totalLine },
          },
          snapshots,
        });
      }
    } catch (err) {
      console.error(`SportsDataIO odds fetch error for ${league}:`, err);
    }
  }

  return { games: allGames };
}

async function fetchStandingsFromSportsDataIO(apiKey: string, leagues: string[], supabase: any): Promise<{ count: number }> {
  let totalCount = 0;
  const currentYear = new Date().getFullYear();

  for (const league of leagues) {
    const slug = SDIO_SPORT_SLUGS[league];
    if (!slug) continue;

    try {
      const url = `${SDIO_API_BASE}/${slug}/scores/json/Standings/${currentYear}?key=${apiKey}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`SportsDataIO standings error for ${league}: ${resp.status}`);
        continue;
      }
      const standings = await resp.json();

      for (const team of standings) {
        const teamName = team.Name || team.City + " " + team.Name || "";
        const fullName = team.City ? `${team.City} ${team.Name}` : teamName;
        const record: Record<string, any> = {
          league,
          season: currentYear,
          team_name: fullName,
          team_abbr: team.Key || makeAbbr(fullName),
          conference: team.Conference || null,
          division: team.Division || null,
          wins: team.Wins || 0,
          losses: team.Losses || 0,
          ties: team.Ties || 0,
          overtime_losses: team.OvertimeLosses || 0,
          win_pct: team.Percentage || 0,
          games_back: team.GamesBack || 0,
          streak: team.StreakDescription || null,
          last_10: team.LastTenWins != null ? `${team.LastTenWins}-${team.LastTenLosses}` : null,
          home_record: team.HomeWins != null ? `${team.HomeWins}-${team.HomeLosses}` : null,
          away_record: team.AwayWins != null ? `${team.AwayWins}-${team.AwayLosses}` : null,
          points_for: team.PointsFor || team.RunsScored || 0,
          points_against: team.PointsAgainst || team.RunsAgainst || 0,
          net_points: (team.PointsFor || 0) - (team.PointsAgainst || 0),
          playoff_seed: team.PlayoffRank || null,
          clinched: team.ClinchIndicator || null,
          external_team_id: team.TeamID ? String(team.TeamID) : null,
          provider: "sportsdataio",
        };

        await supabase
          .from("standings")
          .upsert(record, { onConflict: "league,season,team_name,provider" });
        totalCount++;
      }
    } catch (err) {
      console.error(`SportsDataIO standings error for ${league}:`, err);
    }
  }

  return { count: totalCount };
}

// ═══════════════════════════════════════════════
// MAIN HANDLER — merges all providers
// ═══════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sports = url.searchParams.get("sports") || "NBA,NFL,MLB,NHL";
    const provider = url.searchParams.get("provider") || "all"; // "theodds", "sgo", "sdio", "all"
    const leaguesList = sports.split(",").map(s => s.trim().toUpperCase());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let allGames: NormalizedGame[] = [];
    const meta: Record<string, any> = {};

    // Fetch from The Odds API
    if (provider === "all" || provider === "theodds") {
      const apiKey = Deno.env.get("THE_ODDS_API_KEY");
      if (apiKey) {
        const result = await fetchFromTheOddsAPI(apiKey, leaguesList);
        allGames = allGames.concat(result.games);
        meta.theodds_remaining = result.remaining;
        meta.theodds_count = result.games.length;
      } else {
        meta.theodds_error = "API key not configured";
      }
    }

    // Fetch from SportsGameOdds (throttle after previous provider)
    if (provider === "all" || provider === "sgo") {
      if (provider === "all") await new Promise(r => setTimeout(r, 1500));
      const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
      if (apiKey) {
        const result = await fetchFromSportsGameOdds(apiKey, leaguesList);
        allGames = allGames.concat(result.games);
        meta.sgo_count = result.games.length;
      } else {
        meta.sgo_error = "API key not configured";
      }
    }

    // Fetch from SportsDataIO
    if (provider === "all" || provider === "sdio") {
      const apiKey = Deno.env.get("SPORTSDATAIO_API_KEY");
      if (apiKey) {
        const result = await fetchOddsFromSportsDataIO(apiKey, leaguesList);
        allGames = allGames.concat(result.games);
        meta.sdio_count = result.games.length;

        // Also fetch standings
        const standingsResult = await fetchStandingsFromSportsDataIO(apiKey, leaguesList, supabase);
        meta.sdio_standings_count = standingsResult.count;
      } else {
        meta.sdio_error = "API key not configured";
      }
    }

    // Deduplicate by normalizing team names and matching within 2hr windows
    function normalizeForDedup(name: string): string {
      return name.toUpperCase().replace(/[_\s]+/g, " ").replace(/_NBA|_NFL|_MLB|_NHL|_NCAAB|_NCAAF/gi, "").trim();
    }

    const deduped = new Map<string, NormalizedGame>();
    for (const game of allGames) {
      // Skip games without a valid start time early (before dedup)
      if (!game.start_time || isNaN(new Date(game.start_time).getTime())) {
        console.warn(`Skipping game ${game.external_id} (${game.away_team} @ ${game.home_team}) — invalid start_time: ${game.start_time}`);
        continue;
      }
      const startMs = new Date(game.start_time).getTime();
      const homeNorm = normalizeForDedup(game.home_team);
      const awayNorm = normalizeForDedup(game.away_team);
      const key = `${homeNorm}|${awayNorm}|${Math.floor(startMs / 7200000)}`; // 2hr window

      if (deduped.has(key)) {
        const existing = deduped.get(key)!;
        // Merge snapshots from both providers
        existing.snapshots = [...existing.snapshots, ...game.snapshots];
        // Prefer the version with better data (proper team names, non-zero odds)
        if (game.odds.moneyline.home && !existing.odds.moneyline.home) {
          existing.odds.moneyline = game.odds.moneyline;
        }
        if (game.odds.spread.line && !existing.odds.spread.line) {
          existing.odds.spread = game.odds.spread;
        }
        if (game.odds.total.line && !existing.odds.total.line) {
          existing.odds.total = game.odds.total;
        }
        // Prefer proper display names over ID-style names
        if (!existing.home_team.includes(" ") && game.home_team.includes(" ")) {
          existing.home_team = game.home_team;
          existing.away_team = game.away_team;
          existing.home_abbr = game.home_abbr;
          existing.away_abbr = game.away_abbr;
        }
      } else {
        deduped.set(key, { ...game });
      }
    }

    // Save to database
    const savedGames: any[] = [];
    for (const game of deduped.values()) {
      // Skip games without a valid start time
      if (!game.start_time) {
        console.warn(`Skipping game ${game.external_id} (${game.away_team} @ ${game.home_team}) — no start_time`);
        continue;
      }

      const gameData = {
        external_id: game.external_id,
        league: game.league,
        home_team: game.home_team,
        away_team: game.away_team,
        home_abbr: game.home_abbr,
        away_abbr: game.away_abbr,
        start_time: game.start_time,
        status: game.status,
        venue: game.venue || null,
      };

      const { data: existing } = await supabase
        .from("games")
        .select("id")
        .eq("external_id", game.external_id)
        .maybeSingle();

      let gameId: string;
      if (existing) {
        gameId = existing.id;
        await supabase.from("games").update(gameData).eq("id", gameId);
      } else {
        // Also check by team + time match for cross-provider dedup
        const startTime = new Date(game.start_time);
        const timeBefore = new Date(startTime.getTime() - 3600000).toISOString();
        const timeAfter = new Date(startTime.getTime() + 3600000).toISOString();

        const { data: matchByTeam } = await supabase
          .from("games")
          .select("id")
          .eq("home_team", game.home_team)
          .eq("away_team", game.away_team)
          .gte("start_time", timeBefore)
          .lte("start_time", timeAfter)
          .maybeSingle();

        if (matchByTeam) {
          gameId = matchByTeam.id;
          await supabase.from("games").update(gameData).eq("id", gameId);
        } else {
          const { data: newGame } = await supabase
            .from("games")
            .insert(gameData)
            .select("id")
            .single();
          gameId = newGame!.id;
        }
      }

      // Look up stadium coordinates from stadiums table
      const { data: stadium } = await supabase
        .from("stadiums")
        .select("name, latitude, longitude")
        .eq("team_abbr", game.home_abbr)
        .eq("league", game.league)
        .maybeSingle();

      if (stadium) {
        await supabase.from("games").update({
          venue: game.venue || stadium.name,
          venue_lat: stadium.latitude,
          venue_lng: stadium.longitude,
        }).eq("id", gameId);
      }

      // Store odds snapshots
      if (game.snapshots.length > 0) {
        const snaps = game.snapshots.map(s => ({ game_id: gameId, ...s }));
        await supabase.from("odds_snapshots").insert(snaps);
      }

      savedGames.push({ id: gameId, ...gameData, odds: game.odds });
    }

    return new Response(
      JSON.stringify({ games: savedGames, meta, fetched_at: new Date().toISOString() }),
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
