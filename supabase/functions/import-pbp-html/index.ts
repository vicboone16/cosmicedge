import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Sports Reference abbreviation aliases → canonical
const SR_ALIASES: Record<string, Record<string, string>> = {
  NFL: {
    KAN: "KC", SFO: "SF", GNB: "GB", NOR: "NO", NWE: "NE",
    TAM: "TB", LVR: "LV", KEN: "KC", SDG: "LAC", STL: "LAR",
    OAK: "LV", RAI: "LV", RAM: "LAR", CLT: "IND", CRD: "ARI",
    RAV: "BAL", HTX: "HOU", JAG: "JAX",
  },
  NBA: {
    BRK: "BKN", CHO: "CHA", PHO: "PHX", GS: "GSW", SA: "SAS",
    NOH: "NOP", NOK: "NOP", NJN: "BKN", SEA: "OKC",
  },
  NHL: {
    TB: "TBL", LA: "LAK", SJ: "SJS", NJ: "NJD", MON: "MTL",
    WAS: "WSH", VEG: "VGK",
  },
  MLB: {
    CWS: "CHW", SD: "SDP", SF: "SFG", TB: "TBR", WSH: "WSN",
    WAS: "WSN", FLO: "MIA", ANA: "LAA", MON: "WSN",
  },
};

function normalizeSRTeam(league: string, abbr: string): string {
  const raw = abbr.trim().toUpperCase();
  return SR_ALIASES[league]?.[raw] || raw;
}

// Known home venues for auto-creation (subset; can expand)
const TEAM_VENUES: Record<string, Record<string, { name: string; lat: number; lng: number }>> = {
  NFL: {
    KC: { name: "GEHA Field at Arrowhead Stadium", lat: 39.0489, lng: -94.4839 },
    BAL: { name: "M&T Bank Stadium", lat: 39.2780, lng: -76.6227 },
    BUF: { name: "Highmark Stadium", lat: 42.7738, lng: -78.7870 },
    DET: { name: "Ford Field", lat: 42.3400, lng: -83.0456 },
    PHI: { name: "Lincoln Financial Field", lat: 39.9008, lng: -75.1675 },
    DAL: { name: "AT&T Stadium", lat: 32.7473, lng: -97.0945 },
    SF: { name: "Levi's Stadium", lat: 37.4033, lng: -121.9695 },
    LAR: { name: "SoFi Stadium", lat: 33.9534, lng: -118.3391 },
    LAC: { name: "SoFi Stadium", lat: 33.9534, lng: -118.3391 },
    GB: { name: "Lambeau Field", lat: 44.5013, lng: -88.0622 },
    NO: { name: "Caesars Superdome", lat: 29.9511, lng: -90.0812 },
    NE: { name: "Gillette Stadium", lat: 42.0909, lng: -71.2643 },
    TB: { name: "Raymond James Stadium", lat: 27.9759, lng: -82.5033 },
    LV: { name: "Allegiant Stadium", lat: 36.0908, lng: -115.1833 },
    MIA: { name: "Hard Rock Stadium", lat: 25.9580, lng: -80.2389 },
    DEN: { name: "Empower Field at Mile High", lat: 39.7439, lng: -105.0201 },
    SEA: { name: "Lumen Field", lat: 47.5952, lng: -122.3316 },
    ARI: { name: "State Farm Stadium", lat: 33.5276, lng: -112.2626 },
    ATL: { name: "Mercedes-Benz Stadium", lat: 33.7553, lng: -84.4006 },
    CAR: { name: "Bank of America Stadium", lat: 35.2258, lng: -80.8528 },
    CHI: { name: "Soldier Field", lat: 41.8623, lng: -87.6167 },
    CIN: { name: "Paycor Stadium", lat: 39.0955, lng: -84.5161 },
    CLE: { name: "Cleveland Browns Stadium", lat: 41.5061, lng: -81.6995 },
    HOU: { name: "NRG Stadium", lat: 29.6847, lng: -95.4107 },
    IND: { name: "Lucas Oil Stadium", lat: 39.7601, lng: -86.1639 },
    JAX: { name: "EverBank Stadium", lat: 30.3239, lng: -81.6373 },
    MIN: { name: "U.S. Bank Stadium", lat: 44.9736, lng: -93.2575 },
    NYG: { name: "MetLife Stadium", lat: 40.8128, lng: -74.0742 },
    NYJ: { name: "MetLife Stadium", lat: 40.8128, lng: -74.0742 },
    PIT: { name: "Acrisure Stadium", lat: 40.4468, lng: -80.0158 },
    TEN: { name: "Nissan Stadium", lat: 36.1665, lng: -86.7713 },
    WAS: { name: "Commanders Field", lat: 38.9076, lng: -76.8645 },
  },
};

// Reverse lookup for full team name
const TEAM_NAMES: Record<string, Record<string, string>> = {
  NFL: {
    ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens",
    BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears",
    CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys",
    DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
    HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
    KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers",
    LAR: "Los Angeles Rams", MIA: "Miami Dolphins", MIN: "Minnesota Vikings",
    NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
    NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
    SF: "San Francisco 49ers", SEA: "Seattle Seahawks", TB: "Tampa Bay Buccaneers",
    TEN: "Tennessee Titans", WAS: "Washington Commanders",
  },
  NBA: {
    ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
    CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
    DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
    GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
    LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
    MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
    NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
    ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
    POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
    TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
  },
  NHL: {
    ANA: "Anaheim Ducks", BOS: "Boston Bruins", BUF: "Buffalo Sabres",
    CGY: "Calgary Flames", CAR: "Carolina Hurricanes", CHI: "Chicago Blackhawks",
    COL: "Colorado Avalanche", CBJ: "Columbus Blue Jackets", DAL: "Dallas Stars",
    DET: "Detroit Red Wings", EDM: "Edmonton Oilers", FLA: "Florida Panthers",
    LAK: "Los Angeles Kings", MIN: "Minnesota Wild", MTL: "Montreal Canadiens",
    NSH: "Nashville Predators", NJD: "New Jersey Devils", NYI: "New York Islanders",
    NYR: "New York Rangers", OTT: "Ottawa Senators", PHI: "Philadelphia Flyers",
    PIT: "Pittsburgh Penguins", SJS: "San Jose Sharks", SEA: "Seattle Kraken",
    STL: "St. Louis Blues", TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs",
    UTA: "Utah Mammoth", VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights",
    WSH: "Washington Capitals", WPG: "Winnipeg Jets",
  },
  MLB: {
    ARI: "Arizona Diamondbacks", ATL: "Atlanta Braves", BAL: "Baltimore Orioles",
    BOS: "Boston Red Sox", CHC: "Chicago Cubs", CHW: "Chicago White Sox",
    CIN: "Cincinnati Reds", CLE: "Cleveland Guardians", COL: "Colorado Rockies",
    DET: "Detroit Tigers", HOU: "Houston Astros", KCR: "Kansas City Royals",
    LAA: "Los Angeles Angels", LAD: "Los Angeles Dodgers", MIA: "Miami Marlins",
    MIL: "Milwaukee Brewers", MIN: "Minnesota Twins", NYM: "New York Mets",
    NYY: "New York Yankees", OAK: "Oakland Athletics", PHI: "Philadelphia Phillies",
    PIT: "Pittsburgh Pirates", SDP: "San Diego Padres", SFG: "San Francisco Giants",
    SEA: "Seattle Mariners", STL: "St. Louis Cardinals", TBR: "Tampa Bay Rays",
    TEX: "Texas Rangers", TOR: "Toronto Blue Jays", WSN: "Washington Nationals",
  },
};

interface ParsedPlay {
  quarter: number;
  clock: string;
  down: number | null;
  yards_to_go: number | null;
  location: string;
  away_score: number;
  home_score: number;
  detail: string;
  epb: number | null;
  epa: number | null;
  is_scoring: boolean;
  is_touchdown: boolean;
  sequence: number;
}

interface ParseResult {
  awayAbbr: string;
  homeAbbr: string;
  plays: ParsedPlay[];
  quarterScores: { quarter: number; home_score: number; away_score: number }[];
}

function parseHTML(html: string, league: string): ParseResult {
  // Extract team abbreviations from header
  // Look for data-stat="pbp_score_aw" and data-stat="pbp_score_hm"
  const awayMatch = html.match(/data-stat="pbp_score_aw"[^>]*>([^<]+)</);
  const homeMatch = html.match(/data-stat="pbp_score_hm"[^>]*>([^<]+)</);
  // Also try aria-label on the th
  const awayAria = html.match(/aria-label="([^"]+)"[^>]*data-stat="pbp_score_aw"/);
  const homeAria = html.match(/aria-label="([^"]+)"[^>]*data-stat="pbp_score_hm"/);

  let rawAway = (awayAria?.[1] || awayMatch?.[1] || "").trim();
  let rawHome = (homeAria?.[1] || homeMatch?.[1] || "").trim();

  const awayAbbr = normalizeSRTeam(league, rawAway);
  const homeAbbr = normalizeSRTeam(league, rawHome);

  // Parse rows
  const plays: ParsedPlay[] = [];
  const rowRegex = /<tr[^>]*data-row="(\d+)"[^>]*>(.*?)<\/tr>/gs;
  let match;
  let seq = 0;

  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[2];
    seq++;

    const getStat = (stat: string): string => {
      const re = new RegExp(`data-stat="${stat}"[^>]*>([^<]*)<`, "s");
      const m = rowHtml.match(re);
      return m ? m[1].trim() : "";
    };

    const quarter = parseInt(getStat("quarter")) || 0;
    const clock = getStat("qtr_time_remain");
    const downStr = getStat("down");
    const ytgStr = getStat("yds_to_go");
    const location = getStat("location");
    const awayScoreStr = getStat("pbp_score_aw");
    const homeScoreStr = getStat("pbp_score_hm");
    const detail = getStat("detail");
    const epbStr = getStat("exp_pts_before");
    const epaStr = getStat("exp_pts_after");

    const isScoringRow = match[0].includes('class=" score"') || match[0].includes('class="score"');
    const isTD = detail.toLowerCase().includes("touchdown");

    plays.push({
      quarter,
      clock,
      down: downStr ? parseInt(downStr) : null,
      yards_to_go: ytgStr ? parseInt(ytgStr) : null,
      location,
      away_score: awayScoreStr ? parseInt(awayScoreStr) : 0,
      home_score: homeScoreStr ? parseInt(homeScoreStr) : 0,
      detail,
      epb: epbStr ? parseFloat(epbStr) : null,
      epa: epaStr ? parseFloat(epaStr) : null,
      is_scoring: isScoringRow,
      is_touchdown: isTD,
      sequence: seq,
    });
  }

  // Compute quarter scores from the last play in each quarter
  const quarterMap = new Map<number, { home: number; away: number }>();
  for (const play of plays) {
    if (play.quarter > 0) {
      quarterMap.set(play.quarter, { home: play.home_score, away: play.away_score });
    }
  }

  // Convert cumulative to per-quarter
  const quarters = Array.from(quarterMap.entries()).sort((a, b) => a[0] - b[0]);
  const quarterScores: { quarter: number; home_score: number; away_score: number }[] = [];
  let prevHome = 0, prevAway = 0;
  for (const [q, scores] of quarters) {
    quarterScores.push({
      quarter: q,
      home_score: scores.home - prevHome,
      away_score: scores.away - prevAway,
    });
    prevHome = scores.home;
    prevAway = scores.away;
  }

  return { awayAbbr, homeAbbr, plays, quarterScores };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin
    const token = authHeader?.replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Admin access required");

    const body = await req.json();
    const { html, league, away_override, home_override, game_date, game_id } = body;

    if (!html) throw new Error("Missing HTML content");
    if (!league) throw new Error("Missing league");

    // Parse the HTML
    const parsed = parseHTML(html, league);
    const awayAbbr = away_override || parsed.awayAbbr;
    const homeAbbr = home_override || parsed.homeAbbr;

    if (!awayAbbr || !homeAbbr) {
      throw new Error("Could not detect teams. Please provide overrides.");
    }

    const awayName = TEAM_NAMES[league]?.[awayAbbr] || awayAbbr;
    const homeName = TEAM_NAMES[league]?.[homeAbbr] || homeAbbr;

    // Final scores from last play
    const lastPlay = parsed.plays[parsed.plays.length - 1];
    const finalHomeScore = lastPlay?.home_score ?? 0;
    const finalAwayScore = lastPlay?.away_score ?? 0;

    let resolvedGameId = game_id;

    if (!resolvedGameId && game_date) {
      // Try to find existing game by teams + date (±1 day window)
      const dateObj = new Date(game_date + "T12:00:00Z");
      const dayBefore = new Date(dateObj.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const dayAfter = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const { data: matchedGames } = await supabase
        .from("games")
        .select("id, start_time, status")
        .eq("league", league)
        .eq("home_abbr", homeAbbr)
        .eq("away_abbr", awayAbbr)
        .gte("start_time", dayBefore)
        .lte("start_time", dayAfter)
        .limit(5);

      if (matchedGames && matchedGames.length === 1) {
        resolvedGameId = matchedGames[0].id;
      } else if (matchedGames && matchedGames.length > 1) {
        // Return matches for user to pick
        return new Response(JSON.stringify({
          status: "multiple_matches",
          awayAbbr, homeAbbr, awayName, homeName,
          matches: matchedGames,
          quarterScores: parsed.quarterScores,
          playCount: parsed.plays.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // If still no game, auto-create
    if (!resolvedGameId) {
      const venue = TEAM_VENUES[league]?.[homeAbbr];
      const startTime = game_date ? new Date(game_date + "T19:00:00Z").toISOString() : new Date().toISOString();

      const { data: newGame, error: gameErr } = await supabase
        .from("games")
        .insert({
          league,
          home_team: homeName,
          away_team: awayName,
          home_abbr: homeAbbr,
          away_abbr: awayAbbr,
          home_score: finalHomeScore,
          away_score: finalAwayScore,
          status: "final",
          start_time: startTime,
          source: "pbp_import",
          venue: venue?.name || null,
          venue_lat: venue?.lat || null,
          venue_lng: venue?.lng || null,
        })
        .select("id")
        .single();

      if (gameErr) throw new Error(`Game creation failed: ${gameErr.message}`);
      resolvedGameId = newGame.id;
    }

    // Update game with final scores if needed
    await supabase
      .from("games")
      .update({
        home_score: finalHomeScore,
        away_score: finalAwayScore,
        status: "final",
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedGameId);

    // Delete existing PBP + quarters for this game
    if (league === "NFL") {
      await supabase.from("nfl_play_by_play").delete().eq("game_id", resolvedGameId);
    } else {
      await supabase.from("play_by_play").delete().eq("game_id", resolvedGameId);
    }
    await supabase.from("game_quarters").delete().eq("game_id", resolvedGameId);

    // Insert plays in batches
    const BATCH = 200;
    if (league === "NFL") {
      const nflRows = parsed.plays.map((p) => ({
        game_id: resolvedGameId!,
        sequence: p.sequence,
        quarter: p.quarter || null,
        game_clock: p.clock || null,
        down: p.down,
        yards_to_go: p.yards_to_go,
        yard_line: p.location || null,
        event: p.detail || null,
        is_scoring_play: p.is_scoring,
        is_touchdown: p.is_touchdown,
        possession_abbr: null,
        details_json: { epb: p.epb, epa: p.epa, away_score: p.away_score, home_score: p.home_score },
      }));

      for (let i = 0; i < nflRows.length; i += BATCH) {
        const batch = nflRows.slice(i, i + BATCH);
        const { error } = await supabase.from("nfl_play_by_play").insert(batch);
        if (error) throw new Error(`PBP insert error: ${error.message}`);
      }
    } else {
      const genericRows = parsed.plays.map((p) => ({
        game_id: resolvedGameId!,
        sequence: p.sequence,
        quarter: p.quarter || 1,
        clock: p.clock || null,
        event_type: p.is_scoring ? "score" : "play",
        description: p.detail || null,
        home_score: p.home_score,
        away_score: p.away_score,
        team_abbr: null,
      }));

      for (let i = 0; i < genericRows.length; i += BATCH) {
        const batch = genericRows.slice(i, i + BATCH);
        const { error } = await supabase.from("play_by_play").insert(batch);
        if (error) throw new Error(`PBP insert error: ${error.message}`);
      }
    }

    // Insert quarter scores
    if (parsed.quarterScores.length > 0) {
      const qRows = parsed.quarterScores.map((q) => ({
        game_id: resolvedGameId!,
        quarter: q.quarter,
        home_score: q.home_score,
        away_score: q.away_score,
      }));
      const { error: qErr } = await supabase.from("game_quarters").insert(qRows);
      if (qErr) console.warn("Quarter scores insert warning:", qErr.message);
    }

    return new Response(JSON.stringify({
      status: "success",
      game_id: resolvedGameId,
      awayAbbr, homeAbbr, awayName, homeName,
      plays_imported: parsed.plays.length,
      quarters: parsed.quarterScores.length,
      final_score: `${finalAwayScore}-${finalHomeScore}`,
      game_created: !game_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
