import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SDIO NBA TeamID → team info
const SDIO_TEAMS: Record<number, { full: string; abbr: string }> = {
  1:  { full: "Washington Wizards",          abbr: "WAS" },
  2:  { full: "Charlotte Hornets",           abbr: "CHA" },
  3:  { full: "Atlanta Hawks",               abbr: "ATL" },
  4:  { full: "Miami Heat",                  abbr: "MIA" },
  5:  { full: "Orlando Magic",               abbr: "ORL" },
  6:  { full: "New York Knicks",             abbr: "NYK" },
  7:  { full: "Philadelphia 76ers",          abbr: "PHI" },
  8:  { full: "Brooklyn Nets",               abbr: "BKN" },
  9:  { full: "Boston Celtics",              abbr: "BOS" },
  10: { full: "Toronto Raptors",             abbr: "TOR" },
  11: { full: "Chicago Bulls",               abbr: "CHI" },
  12: { full: "Cleveland Cavaliers",         abbr: "CLE" },
  13: { full: "Indiana Pacers",              abbr: "IND" },
  14: { full: "Detroit Pistons",             abbr: "DET" },
  15: { full: "Milwaukee Bucks",             abbr: "MIL" },
  16: { full: "Minnesota Timberwolves",      abbr: "MIN" },
  17: { full: "Utah Jazz",                   abbr: "UTA" },
  18: { full: "Oklahoma City Thunder",       abbr: "OKC" },
  19: { full: "Portland Trail Blazers",      abbr: "POR" },
  20: { full: "Denver Nuggets",              abbr: "DEN" },
  21: { full: "Memphis Grizzlies",           abbr: "MEM" },
  22: { full: "Houston Rockets",             abbr: "HOU" },
  23: { full: "New Orleans Pelicans",        abbr: "NOP" },
  24: { full: "San Antonio Spurs",           abbr: "SAS" },
  25: { full: "Dallas Mavericks",            abbr: "DAL" },
  26: { full: "Golden State Warriors",       abbr: "GSW" },
  27: { full: "Los Angeles Lakers",          abbr: "LAL" },
  28: { full: "Los Angeles Clippers",        abbr: "LAC" },
  29: { full: "Phoenix Suns",                abbr: "PHX" },
  30: { full: "Sacramento Kings",            abbr: "SAC" },
};

// NBA.com team IDs → team info (used for schedule imports)
const NBA_TEAMS: Record<string, { full: string; abbr: string }> = {
  "1610612737": { full: "Atlanta Hawks",             abbr: "ATL" },
  "1610612738": { full: "Boston Celtics",            abbr: "BOS" },
  "1610612739": { full: "Cleveland Cavaliers",       abbr: "CLE" },
  "1610612740": { full: "New Orleans Pelicans",      abbr: "NOP" },
  "1610612741": { full: "Chicago Bulls",             abbr: "CHI" },
  "1610612742": { full: "Dallas Mavericks",          abbr: "DAL" },
  "1610612743": { full: "Denver Nuggets",            abbr: "DEN" },
  "1610612744": { full: "Golden State Warriors",     abbr: "GSW" },
  "1610612745": { full: "Houston Rockets",           abbr: "HOU" },
  "1610612746": { full: "Los Angeles Clippers",      abbr: "LAC" },
  "1610612747": { full: "Los Angeles Lakers",        abbr: "LAL" },
  "1610612748": { full: "Miami Heat",                abbr: "MIA" },
  "1610612749": { full: "Milwaukee Bucks",           abbr: "MIL" },
  "1610612750": { full: "Minnesota Timberwolves",    abbr: "MIN" },
  "1610612751": { full: "Brooklyn Nets",             abbr: "BKN" },
  "1610612752": { full: "New York Knicks",           abbr: "NYK" },
  "1610612753": { full: "Orlando Magic",             abbr: "ORL" },
  "1610612754": { full: "Indiana Pacers",            abbr: "IND" },
  "1610612755": { full: "Philadelphia 76ers",        abbr: "PHI" },
  "1610612756": { full: "Phoenix Suns",              abbr: "PHX" },
  "1610612757": { full: "Portland Trail Blazers",    abbr: "POR" },
  "1610612758": { full: "Sacramento Kings",          abbr: "SAC" },
  "1610612759": { full: "San Antonio Spurs",         abbr: "SAS" },
  "1610612760": { full: "Oklahoma City Thunder",     abbr: "OKC" },
  "1610612761": { full: "Toronto Raptors",           abbr: "TOR" },
  "1610612762": { full: "Utah Jazz",                 abbr: "UTA" },
  "1610612763": { full: "Memphis Grizzlies",         abbr: "MEM" },
  "1610612764": { full: "Washington Wizards",        abbr: "WAS" },
  "1610612765": { full: "Detroit Pistons",           abbr: "DET" },
  "1610612766": { full: "Charlotte Hornets",         abbr: "CHA" },
};

// Reverse lookup: full team name → abbr (NBA from SDIO)
const NAME_TO_ABBR: Record<string, string> = {};
for (const t of Object.values(SDIO_TEAMS)) {
  NAME_TO_ABBR[t.full] = t.abbr;
}

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
  "Nashville Predators": "NSH", "New Jersey Devils": "NJD", "New York Islanders": "NYI",
  "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS", "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL", "Toronto Maple Leafs": "TOR",
  "Utah Hockey Club": "UTA", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
  // Handle Montreal without accent
  "Montreal Canadiens": "MTL",
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

// Unified league team lookup
const LEAGUE_TEAM_ABBR: Record<string, Record<string, string>> = {
  NBA: NAME_TO_ABBR,
  NFL: NFL_TEAMS,
  NHL: NHL_TEAMS,
  MLB: MLB_TEAMS,
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

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
    const { action, records, league = "NBA", csv_text } = body;
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Helper: parse CSV text into array of objects
    function parseCsv(text: string): any[] {
      const lines = text.trim().split("\n");
      if (lines.length < 2) return [];
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      return lines.slice(1).map(line => {
        // Handle quoted fields with commas
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') { inQuotes = !inQuotes; continue; }
          if (char === ',' && !inQuotes) { values.push(current.trim()); current = ""; continue; }
          current += char;
        }
        values.push(current.trim());
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ""; });
        return obj;
      });
    }

    // ── ACTION: stadiums ──
    if (action === "stadiums") {
      const rows = records
        .filter((r: any) => r.Name && r.GeoLat && r.GeoLong)
        .map((r: any) => ({
          external_id: String(r.StadiumID),
          name: r.Name,
          city: r.City || null,
          state: r.State || null,
          country: r.Country || null,
          latitude: Number(r.GeoLat),
          longitude: Number(r.GeoLong),
          capacity: num(r.Capacity),
          league,
          timezone: "America/New_York",
        }));

      for (const row of rows) {
        // Check if stadium already exists by name
        const { data: existing } = await supabase
          .from("stadiums")
          .select("id")
          .eq("name", row.name)
          .eq("league", league)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update existing
          const { error } = await supabase
            .from("stadiums")
            .update(row)
            .eq("id", existing[0].id);
          if (error) errors.push(`Stadium ${row.name}: ${error.message}`);
          else inserted++;
        } else {
          const { error } = await supabase.from("stadiums").insert(row);
          if (error) errors.push(`Stadium ${row.name}: ${error.message}`);
          else inserted++;
        }
      }
    }

    // ── ACTION: games ──
    // Expects records from the Game file: {GameID, Season, Status, DateTime, AwayTeamID, HomeTeamID, StadiumID}
    else if (action === "games") {
      // Pre-fetch stadiums for venue lookup
      const { data: stadiums } = await supabase
        .from("stadiums")
        .select("external_id, name, latitude, longitude")
        .eq("league", league);
      const stadiumMap = new Map(
        (stadiums || []).map((s) => [s.external_id, s])
      );

      const gameRows = records
        .filter((r: any) => r.Status !== "Canceled" && r.DateTime)
        .map((r: any) => {
          const home = SDIO_TEAMS[Number(r.HomeTeamID)];
          const away = SDIO_TEAMS[Number(r.AwayTeamID)];
          if (!home || !away) return null;

          const stadium = stadiumMap.get(String(r.StadiumID));
          return {
            external_id: String(r.GameID),
            league,
            home_team: home.full,
            away_team: away.full,
            home_abbr: home.abbr,
            away_abbr: away.abbr,
            start_time: new Date(r.DateTime).toISOString(),
            status: r.Status === "F/OT" ? "Final/OT" : r.Status || "Final",
            venue: stadium?.name || null,
            venue_lat: stadium?.latitude || null,
            venue_lng: stadium?.longitude || null,
            source: "sdio",
          };
        })
        .filter(Boolean);

      // Check which games already exist by external_id
      const extIds = gameRows.map((r: any) => r.external_id);
      const { data: existing } = await supabase
        .from("games")
        .select("external_id")
        .in("external_id", extIds);
      const existingSet = new Set((existing || []).map((e) => e.external_id));
      const newGames = gameRows.filter((r: any) => !existingSet.has(r.external_id));
      skipped += gameRows.length - newGames.length;

      for (let i = 0; i < newGames.length; i += 100) {
        const batch = newGames.slice(i, i + 100);
        const { data, error } = await supabase
          .from("games")
          .insert(batch)
          .select("id");
        if (error) errors.push(`Games batch ${i}: ${error.message}`);
        else inserted += data?.length || batch.length;
      }
    }

    // ── ACTION: team_game_stats ──
    // Expects records from TeamGame file: {TeamID, Name, GameID, Opponent, HomeOrAway, DateTime, Points, ...stats}
    else if (action === "team_game_stats") {
      // Fetch all SDIO games by external_id
      const { data: games } = await supabase
        .from("games")
        .select("id, external_id")
        .eq("league", league)
        .eq("source", "sdio");

      const gameLookup = new Map(
        (games || []).map((g) => [g.external_id, g.id])
      );

      const statRows: any[] = [];
      for (const r of records) {
        const gameId = gameLookup.get(String(r.GameID));
        if (!gameId) {
          skipped++;
          continue;
        }

        const abbr = NAME_TO_ABBR[r.Name];
        if (!abbr) {
          skipped++;
          continue;
        }

        statRows.push({
          game_id: gameId,
          team_abbr: abbr,
          is_home: r.HomeOrAway === "HOME",
          points: num(r.Points),
          fg_made: num(r.FieldGoalsMade),
          fg_attempted: num(r.FieldGoalsAttempted),
          three_made: num(r.ThreePointersMade),
          three_attempted: num(r.ThreePointersAttempted),
          ft_made: num(r.FreeThrowsMade),
          ft_attempted: num(r.FreeThrowsAttempted),
          off_rebounds: num(r.OffensiveRebounds),
          def_rebounds: num(r.DefensiveRebounds),
          rebounds: num(r.Rebounds),
          assists: num(r.Assists),
          steals: num(r.Steals),
          blocks: num(r.BlockedShots),
          turnovers: num(r.Turnovers),
        });
      }

      for (let i = 0; i < statRows.length; i += 100) {
        const batch = statRows.slice(i, i + 100);
        const { error } = await supabase.from("team_game_stats").insert(batch);
        if (error) {
          if (error.code === "23505") skipped += batch.length;
          else errors.push(`Stats batch ${i}: ${error.message}`);
        } else {
          inserted += batch.length;
        }
      }
    }

    // ── ACTION: game_scores ──
    // Updates games with final scores from TeamGame data
    else if (action === "game_scores") {
      const gameScores = new Map<string, { home_score: number; away_score: number }>();
      for (const r of records) {
        const gid = String(r.GameID);
        if (!gameScores.has(gid)) {
          gameScores.set(gid, { home_score: 0, away_score: 0 });
        }
        const entry = gameScores.get(gid)!;
        if (r.HomeOrAway === "HOME") entry.home_score = num(r.Points) || 0;
        else entry.away_score = num(r.Points) || 0;
      }

      const { data: games } = await supabase
        .from("games")
        .select("id, external_id")
        .eq("league", league)
        .eq("source", "sdio");

      const gameLookup = new Map(
        (games || []).map((g) => [g.external_id, g.id])
      );

      for (const [extId, scores] of gameScores) {
        const gameId = gameLookup.get(extId);
        if (!gameId) { skipped++; continue; }

        const { error } = await supabase
          .from("games")
          .update(scores)
          .eq("id", gameId);

        if (error) errors.push(`Score update ${extId}: ${error.message}`);
        else inserted++;
      }
    }

    // ── ACTION: schedule ──
    // Imports schedule data for any league. Supports NBA (teamId lookup) and NFL/NHL/MLB (team name lookup).
    else if (action === "schedule") {
      // Pre-fetch stadiums for venue lookup by name (search all leagues since names may not match league field)
      const { data: stadiums } = await supabase
        .from("stadiums")
        .select("name, latitude, longitude");
      const stadiumMap = new Map(
        (stadiums || []).map((s) => [s.name, s])
      );

      const teamAbbrMap = LEAGUE_TEAM_ABBR[league] || {};
      const scheduleRecords = csv_text ? parseCsv(csv_text) : records;

      const gameRows = scheduleRecords
        .filter((r: any) => {
          if (league === "NBA") {
            const homeId = String(r.homeTeamId || r.hometeamId);
            const awayId = String(r.awayTeamId || r.awayteamId);
            return homeId !== "0" && awayId !== "0" &&
                   NBA_TEAMS[homeId] && NBA_TEAMS[awayId] &&
                   r.gameLabel !== "Preseason";
          }
          // NFL/NHL/MLB: use team names directly
          const homeName = r.homeTeamName;
          const awayName = r.awayTeamName;
          return homeName && awayName &&
                 teamAbbrMap[homeName] && teamAbbrMap[awayName] &&
                 r.gameLabel !== "Preseason";
        })
        .map((r: any) => {
          let homeFull: string, awayFull: string, homeAbbr: string, awayAbbr: string;

          if (league === "NBA") {
            const home = NBA_TEAMS[String(r.homeTeamId || r.hometeamId)];
            const away = NBA_TEAMS[String(r.awayTeamId || r.awayteamId)];
            homeFull = home.full; awayFull = away.full;
            homeAbbr = home.abbr; awayAbbr = away.abbr;
          } else {
            homeFull = r.homeTeamName;
            awayFull = r.awayTeamName;
            homeAbbr = teamAbbrMap[homeFull];
            awayAbbr = teamAbbrMap[awayFull];
          }

          // Parse datetime — NBA uses EST string, others may have UTC offset
          const dtStr = r.gameDateTimeEst || r.gameDateTimeUTC || r.gameDateTimeEst;
          let startTime: string;
          if (dtStr.includes("+") || dtStr.includes("Z")) {
            // Already has timezone info (UTC)
            startTime = new Date(dtStr).toISOString();
          } else {
            // Assume EST
            startTime = new Date(dtStr.replace(" ", "T") + "-05:00").toISOString();
          }

          const stadium = stadiumMap.get(r.arenaName || r.venueName);
          const venueLat = Number(r.venueLatitude) || stadium?.latitude || null;
          const venueLng = Number(r.venueLongitude) || stadium?.longitude || null;

          return {
            external_id: String(r.gameId),
            league,
            home_team: homeFull,
            away_team: awayFull,
            home_abbr: homeAbbr,
            away_abbr: awayAbbr,
            start_time: startTime,
            status: "scheduled",
            venue: r.arenaName || r.venueName || null,
            venue_lat: venueLat,
            venue_lng: venueLng,
            source: `${league.toLowerCase()}_schedule`,
          };
        });

      // Check which games already exist
      const extIds = gameRows.map((r: any) => r.external_id);
      // Batch the lookup since there could be >1000 IDs
      const existingSet = new Set<string>();
      for (let i = 0; i < extIds.length; i += 500) {
        const batch = extIds.slice(i, i + 500);
        const { data: existing } = await supabase
          .from("games")
          .select("external_id")
          .in("external_id", batch);
        (existing || []).forEach((e) => existingSet.add(e.external_id!));
      }

      const newGames = gameRows.filter((r: any) => !existingSet.has(r.external_id));
      skipped += gameRows.length - newGames.length;

      for (let i = 0; i < newGames.length; i += 100) {
        const batch = newGames.slice(i, i + 100);
        const { data, error } = await supabase
          .from("games")
          .insert(batch)
          .select("id");
        if (error) errors.push(`Schedule batch ${i}: ${error.message}`);
        else inserted += data?.length || batch.length;
      }
    }

    // ── ACTION: team_season_stats ──
    // Imports TeamSeason data with SDIO TeamIDs
    else if (action === "team_season_stats") {
      const statRows = records
        .filter((r: any) => {
          const team = SDIO_TEAMS[Number(r.TeamID)];
          return team && num(r.Games) && Number(r.Games) >= 70; // full season only
        })
        .map((r: any) => {
          const team = SDIO_TEAMS[Number(r.TeamID)];
          const gp = Number(r.Games);
          return {
            team_abbr: team.abbr,
            season: 2025,
            league,
            points_per_game: gp ? Math.round((num(r.Points) || 0) / gp * 10) / 10 : null,
            opp_points_per_game: null,
            fg_pct: num(r.FieldGoalsPercentage),
            three_pct: num(r.ThreePointersPercentage),
            ft_pct: num(r.FreeThrowsPercentage),
            pace: null,
            off_rating: null,
            def_rating: null,
            net_rating: null,
          };
        });

      for (const row of statRows) {
        // Upsert by team_abbr + season
        const { data: existing } = await supabase
          .from("team_season_stats")
          .select("id")
          .eq("team_abbr", row.team_abbr)
          .eq("season", row.season)
          .limit(1);

        if (existing && existing.length > 0) {
          const { error } = await supabase
            .from("team_season_stats")
            .update(row)
            .eq("id", existing[0].id);
          if (error) errors.push(`TSS ${row.team_abbr}: ${error.message}`);
          else inserted++;
        } else {
          const { error } = await supabase.from("team_season_stats").insert(row);
          if (error) errors.push(`TSS ${row.team_abbr}: ${error.message}`);
          else inserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, skipped, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
