import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.208.0/csv/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── team‑name → abbreviation map (matches existing codebase) ──
const TEAM_ABBR: Record<string, string> = {
  // NBA
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "LA Clippers": "LAC",
  "LA Lakers": "LAL", "Memphis Grizzlies": "MEM", "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP", "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA", "Washington Wizards": "WAS",
  // NFL
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
  // MLB
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
  // NHL
  "Anaheim Ducks": "ANA", "Arizona Coyotes": "ARI", "Boston Bruins": "BOS",
  "Buffalo Sabres": "BUF", "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR",
  "Chicago Blackhawks": "CHI", "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ",
  "Dallas Stars": "DAL", "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM",
  "Florida Panthers": "FLA", "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN",
  "Montreal Canadiens": "MTL", "Nashville Predators": "NSH", "New Jersey Devils": "NJD",
  "New York Islanders": "NYI", "New York Rangers": "NYR", "Ottawa Senators": "OTT",
  "Philadelphia Flyers": "PHI", "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS",
  "Seattle Kraken": "SEA", "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
  "Utah Hockey Club": "UTA",
  "Utah Mammoth": "UTA",
};

function abbr(teamName: string): string {
  return TEAM_ABBR[teamName] || teamName.substring(0, 3).toUpperCase();
}

// ── header normalisation helpers ──
function normalizeHeader(h: string): string {
  return h.trim().replace(/[\s_]+/g, "").toLowerCase();
}

function findCol(headers: string[], ...candidates: string[]): number {
  const normed = headers.map(normalizeHeader);
  for (const c of candidates) {
    const idx = normed.indexOf(c.toLowerCase().replace(/[\s_]+/g, ""));
    if (idx !== -1) return idx;
  }
  return -1;
}

function val(row: string[], idx: number): string | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx]?.trim();
  return v === "" ? null : v;
}

function num(row: string[], idx: number): number | null {
  const v = val(row, idx);
  if (v === null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication - this function handles data imports
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: authErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const league = (formData.get("league") as string || "").toUpperCase();
    const dataType = formData.get("data_type") as string || "games";

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await file.text();
    const rows = parse(text, { skipFirstRow: false }) as string[][];
    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: "File has no data rows" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip title/metadata rows — find the first row that looks like a header
    // (has at least 3 columns and contains recognizable column names)
    let headerIdx = 0;
    const headerCandidates = ["date", "home", "away", "visitor", "hometeam", "awayteam", "time", "datetime", "g", "score"];
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const normed = rows[i].map(normalizeHeader);
      const matches = normed.filter(h => headerCandidates.includes(h));
      if (matches.length >= 2) { headerIdx = i; break; }
    }

    const headers = rows[headerIdx];
    const dataRows = rows.slice(headerIdx + 1);
    let rowsInserted = 0;
    let rowsSkipped = 0;
    const errors: string[] = [];
    const BATCH = 200;

    if (dataType === "games") {
      const iDate = findCol(headers, "DateTime", "Date", "Day", "GameDate", "StartTime", "StartTimeEt", "start_time_et");
      const iHome = findCol(headers, "HomeTeam", "Home", "HomeTeamName", "home_team");
      const iAway = findCol(headers, "AwayTeam", "Away", "AwayTeamName", "Visitor", "VisitorTeam", "visitor_team");
      const iHomeAbbr = findCol(headers, "HomeAbbrev", "HomeAbbr", "home_abbrev", "home_abbr");
      const iAwayAbbr = findCol(headers, "AwayAbbrev", "AwayAbbr", "VisitorAbbrev", "visitor_abbrev", "away_abbrev", "away_abbr");
      let iHomeScore = findCol(headers, "HomeScore", "HomeTeamScore", "HomePoints", "HomePts", "home_pts");
      let iAwayScore = findCol(headers, "AwayScore", "AwayTeamScore", "AwayPoints", "AwayPts", "VisitorScore", "VisitorPts", "visitor_pts");
      const iVenue = findCol(headers, "Stadium", "StadiumName", "Venue", "Arena", "arena");
      const iStatus = findCol(headers, "Status", "GameStatus", "game_status");
      const iGameId = findCol(headers, "GameId", "game_id");

      // Handle hockey-reference style: "Visitor,G,Home,G" — score columns named "G" adjacent to team columns
      if (iHomeScore < 0 && iAwayScore < 0) {
        const normed = headers.map(normalizeHeader);
        // Find all columns named "g" (goals) — first is visitor goals, second is home goals
        const gIndices = normed.reduce((acc: number[], h, i) => { if (h === "g") acc.push(i); return acc; }, []);
        if (gIndices.length >= 2) {
          iAwayScore = gIndices[0]; // first G is after Visitor
          iHomeScore = gIndices[1]; // second G is after Home
        }
      }

      if (iHome < 0 || iAway < 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Could not find HomeTeam/AwayTeam columns" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Detect timezone from column names or explicit timezone column
      const iTimezone = findCol(headers, "Timezone", "TimeZone", "TZ", "timezone", "tz");
      const timeColCandidates = ["StartTimeEt", "start_time_et", "StartTimePt", "start_time_pt",
        "StartTimeCt", "start_time_ct", "StartTimeMt", "start_time_mt",
        "StartTimeUtc", "start_time_utc", "StartTime", "start_time", "Time", "time"];
      const iTime = findCol(headers, ...timeColCandidates);

      // Auto-detect timezone from column name suffix
      function detectTimezoneFromHeader(): string {
        if (iTime < 0) return "ET";
        const colName = normalizeHeader(headers[iTime]);
        if (colName.endsWith("utc")) return "UTC";
        if (colName.endsWith("pt")) return "PT";
        if (colName.endsWith("ct")) return "CT";
        if (colName.endsWith("mt")) return "MT";
        if (colName.endsWith("et")) return "ET";
        return "ET"; // default to Eastern for US sports
      }
      const defaultTZ = detectTimezoneFromHeader();

      // UTC offsets: standard / daylight for each US timezone
      function getUtcOffset(tz: string, month: number): number {
        const isDST = month >= 2 && month <= 10; // rough Mar-Nov = DST
        switch (tz.toUpperCase()) {
          case "ET": case "EST": case "EDT": return isDST ? 4 : 5;
          case "CT": case "CST": case "CDT": return isDST ? 5 : 6;
          case "MT": case "MST": case "MDT": return isDST ? 6 : 7;
          case "PT": case "PST": case "PDT": return isDST ? 7 : 8;
          case "UTC": case "GMT": return 0;
          default: return isDST ? 4 : 5; // fallback to ET
        }
      }

      // Pre-fetch all existing games in the date range to match against
      const allParsed = dataRows.map((r) => {
        const homeTeam = val(r, iHome) || "";
        const awayTeam = val(r, iAway) || "";
        const homeAbbrVal = val(r, iHomeAbbr) || abbr(homeTeam);
        const awayAbbrVal = val(r, iAwayAbbr) || abbr(awayTeam);

        // Per-row timezone override (from explicit TZ column) or use detected default
        const rowTZ = (iTimezone >= 0 ? val(r, iTimezone) : null) || defaultTZ;

        // Build start_time: combine date + time columns if separate
        let dateStr = val(r, iDate) || new Date().toISOString();
        let timeStr = "";
        if (iTime >= 0 && iTime !== iDate) {
          timeStr = val(r, iTime) || "";
        }

        let parsedDate: Date;
        if (timeStr) {
          // Parse time like "19:30", "7:30p", "10:00 PM", "5:00 PM"
          const isPM = /pm?$/i.test(timeStr.trim());
          const isAM = /am?$/i.test(timeStr.trim());
          const cleanTime = timeStr.trim().replace(/\s*(am|pm|a|p)$/i, "").trim();
          const parts = cleanTime.split(":");
          let hours = parseInt(parts[0], 10);
          const minutes = parseInt(parts[1] || "0", 10);
          if (isPM && hours < 12) hours += 12;
          if (isAM && hours === 12) hours = 0;

          const dateParts = dateStr.split("-");
          const year = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]) - 1;
          const day = parseInt(dateParts[2]);
          const offset = getUtcOffset(rowTZ, month);
          parsedDate = new Date(Date.UTC(year, month, day, hours + offset, minutes));
        } else if (dateStr.includes("T") || dateStr.includes("Z") || dateStr.includes("+")) {
          // Already ISO or has timezone info
          parsedDate = new Date(dateStr);
          if (isNaN(parsedDate.getTime())) parsedDate = new Date();
        } else {
          // Bare date only — treat as midnight in the detected timezone
          const dateParts = dateStr.split("-");
          const year = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]) - 1;
          const day = parseInt(dateParts[2]);
          const offset = getUtcOffset(rowTZ, month);
          parsedDate = new Date(Date.UTC(year, month, day, 0 + offset, 0));
        }

        const hasScores = num(r, iHomeScore) !== null && num(r, iAwayScore) !== null;
        const statusVal = val(r, iStatus) || (hasScores ? "Final" : "Scheduled");
        const normalizedStatus = statusVal.toLowerCase().includes("final") || statusVal.toLowerCase() === "completed" ? "final" : (statusVal.toLowerCase() === "scheduled" ? "scheduled" : statusVal.toLowerCase());

        return {
          league,
          home_team: homeTeam,
          away_team: awayTeam,
          home_abbr: homeAbbrVal,
          away_abbr: awayAbbrVal,
          home_score: num(r, iHomeScore),
          away_score: num(r, iAwayScore),
          start_time: parsedDate.toISOString(),
          venue: val(r, iVenue),
          venue_lat: null as number | null,
          venue_lng: null as number | null,
          status: normalizedStatus,
          source: "csv",
          external_id: val(r, iGameId),
        };
      }).filter((r) => r.home_team && r.away_team);

      console.log(`Parsed ${allParsed.length} valid game rows from CSV (headers at row ${headerIdx}: ${headers.join(",")})`);
      console.log(`Column indices: date=${iDate} home=${iHome} away=${iAway} homeScore=${iHomeScore} awayScore=${iAwayScore} time=${iTime}`);
      if (allParsed.length > 0) {
        console.log(`First record:`, JSON.stringify(allParsed[0]));
      }

      if (allParsed.length === 0) {
        return new Response(
          JSON.stringify({ success: true, rowsInserted: 0, rowsSkipped: 0, errors: ["No valid game rows parsed from CSV. Check column format."] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auto-fill venue from stadiums table if no venue column in CSV
      if (iVenue < 0) {
        const { data: stadiums } = await supabase
          .from("stadiums")
          .select("team_abbr, name, latitude, longitude")
          .eq("league", league);
        if (stadiums && stadiums.length > 0) {
          const stadiumMap = new Map<string, { name: string; lat: number; lng: number }>();
          for (const s of stadiums) {
            stadiumMap.set(s.team_abbr, { name: s.name, lat: s.latitude, lng: s.longitude });
          }
          for (const rec of allParsed) {
            const stadium = stadiumMap.get(rec.home_abbr);
            if (stadium && !rec.venue) {
              rec.venue = stadium.name;
              (rec as any).venue_lat = stadium.lat;
              (rec as any).venue_lng = stadium.lng;
            }
          }
          console.log(`Auto-filled venues from stadiums table for ${league}`);
        }
      }

      // Fetch existing games for the date range to match by team + date
      const dates = allParsed.map(r => new Date(r.start_time));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      minDate.setDate(minDate.getDate() - 1);
      maxDate.setDate(maxDate.getDate() + 1);

      // Paginate to avoid 1000-row limit
      let existingGames: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase
          .from("games")
          .select("id, home_team, home_abbr, away_team, away_abbr, start_time, status, home_score")
          .eq("league", league)
          .gte("start_time", minDate.toISOString())
          .lte("start_time", maxDate.toISOString())
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        existingGames = existingGames.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      console.log(`Found ${existingGames.length} existing ${league} games in date range`);

      // Build lookup: match by home_abbr + away_abbr + same calendar date (UTC)
      const existingMap = new Map<string, any>();
      for (const g of existingGames) {
        const d = g.start_time.split("T")[0];
        const key = `${g.home_abbr}_${g.away_abbr}_${d}`;
        existingMap.set(key, g);
      }

      for (const rec of allParsed) {
        const d = rec.start_time.split("T")[0];
        const key = `${rec.home_abbr}_${rec.away_abbr}_${d}`;
        const existing = existingMap.get(key);

        if (existing) {
          // Update existing game with scores and status
          if (rec.home_score !== null || rec.away_score !== null) {
            const { error: upErr } = await supabase.from("games").update({
              home_score: rec.home_score,
              away_score: rec.away_score,
              status: rec.status,
              venue: rec.venue || undefined,
            }).eq("id", existing.id);
            if (upErr) errors.push(`Update ${key}: ${upErr.message}`);
            else rowsInserted++;
          } else {
            rowsSkipped++;
          }
        } else {
          // Insert new game
          const { error: insErr } = await supabase.from("games").insert(rec);
          if (insErr) {
            if (insErr.code === "23505") rowsSkipped++;
            else errors.push(`Insert ${key}: ${insErr.message}`);
          } else {
            rowsInserted++;
          }
        }
      }

    } else if (dataType === "odds") {
      const iDate = findCol(headers, "DateTime", "Date", "Day", "GameDate");
      const iHome = findCol(headers, "HomeTeam", "Home");
      const iAway = findCol(headers, "AwayTeam", "Away");
      const iSpread = findCol(headers, "PointSpread", "Spread", "HomeSpread", "Line");
      const iOU = findCol(headers, "OverUnder", "TotalScore", "Total", "OU");
      const iHomeML = findCol(headers, "HomeMoneyLine", "HomeML", "HomePrice");
      const iAwayML = findCol(headers, "AwayMoneyLine", "AwayML", "AwayPrice");
      const iBook = findCol(headers, "Bookmaker", "Sportsbook", "Book");

      for (let i = 0; i < dataRows.length; i += BATCH) {
        const batch = dataRows.slice(i, i + BATCH);
        const records: any[] = [];
        for (const r of batch) {
          const homeTeam = val(r, iHome) || "";
          const awayTeam = val(r, iAway) || "";
          const dateStr = val(r, iDate) || new Date().toISOString();
          const startTime = new Date(dateStr).toISOString();
          const bookmaker = val(r, iBook) || "SportsDataIO";
          const snapshotDate = startTime.split("T")[0];

          if (iSpread >= 0 && val(r, iSpread) !== null) {
            records.push({
              league, home_team: homeTeam, away_team: awayTeam,
              market_type: "spread", bookmaker,
              line: num(r, iSpread),
              home_price: num(r, iHomeML), away_price: num(r, iAwayML),
              start_time: startTime, snapshot_date: snapshotDate, source: "csv",
            });
          }
          if (iOU >= 0 && val(r, iOU) !== null) {
            records.push({
              league, home_team: homeTeam, away_team: awayTeam,
              market_type: "totals", bookmaker,
              line: num(r, iOU),
              home_price: null, away_price: null,
              start_time: startTime, snapshot_date: snapshotDate, source: "csv",
            });
          }
          if (iHomeML >= 0 && iSpread < 0) {
            records.push({
              league, home_team: homeTeam, away_team: awayTeam,
              market_type: "h2h", bookmaker,
              line: null,
              home_price: num(r, iHomeML), away_price: num(r, iAwayML),
              start_time: startTime, snapshot_date: snapshotDate, source: "csv",
            });
          }
        }

        if (records.length > 0) {
          const { error } = await supabase.from("historical_odds").insert(records);
          if (error) {
            errors.push(`Odds batch at row ${i}: ${error.message}`);
          } else {
            rowsInserted += records.length;
          }
        }
      }
    } else if (dataType === "player_stats") {
      const iPlayer = findCol(headers, "Name", "PlayerName", "Player");
      const iTeam = findCol(headers, "Team", "TeamAbbr", "TeamName");
      const iDate = findCol(headers, "DateTime", "Date", "Day", "GameDate");
      const iPts = findCol(headers, "Points", "Pts");
      const iReb = findCol(headers, "Rebounds", "Reb", "TotalRebounds");
      const iAst = findCol(headers, "Assists", "Ast");
      const iStl = findCol(headers, "Steals", "Stl");
      const iBlk = findCol(headers, "Blocks", "Blk");
      const iMin = findCol(headers, "Minutes", "Min");
      const iTO = findCol(headers, "Turnovers", "TO", "Tov");
      const iFGM = findCol(headers, "FieldGoalsMade", "FGM");
      const iFGA = findCol(headers, "FieldGoalsAttempted", "FGA");
      const iFTM = findCol(headers, "FreeThrowsMade", "FTM");
      const iFTA = findCol(headers, "FreeThrowsAttempted", "FTA");
      const i3M = findCol(headers, "ThreePointersMade", "3PM", "ThreeMade");
      const i3A = findCol(headers, "ThreePointersAttempted", "3PA", "ThreeAttempted");
      const iGameId = findCol(headers, "GameID", "GameId", "ExternalGameId");

      if (iPlayer < 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Could not find Player/Name column" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (let i = 0; i < dataRows.length; i += BATCH) {
        const batch = dataRows.slice(i, i + BATCH);
        for (const r of batch) {
          const playerName = val(r, iPlayer);
          const teamName = val(r, iTeam) || "";
          const teamAbbr = abbr(teamName);

          if (!playerName) { rowsSkipped++; continue; }

          // Find or create player
          let { data: players } = await supabase
            .from("players")
            .select("id")
            .ilike("name", playerName)
            .eq("league", league)
            .limit(1);

          let playerId: string;
          if (players && players.length > 0) {
            playerId = players[0].id;
          } else {
            const { data: newPlayer, error: pErr } = await supabase
              .from("players")
              .insert({ name: playerName, league, team: teamAbbr })
              .select("id")
              .single();
            if (pErr || !newPlayer) { errors.push(`Player ${playerName}: ${pErr?.message}`); rowsSkipped++; continue; }
            playerId = newPlayer.id;
          }

          // Find matching game
          const dateStr = val(r, iDate);
          let gameId: string | null = null;
          if (dateStr) {
            const d = new Date(dateStr);
            const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
            const { data: games } = await supabase
              .from("games")
              .select("id")
              .eq("league", league)
              .gte("start_time", dayStart.toISOString())
              .lte("start_time", dayEnd.toISOString())
              .limit(1);
            if (games && games.length > 0) gameId = games[0].id;
          }

          if (!gameId) { rowsSkipped++; continue; }

          const stat = {
            player_id: playerId,
            game_id: gameId,
            team_abbr: teamAbbr,
            points: num(r, iPts),
            rebounds: num(r, iReb),
            assists: num(r, iAst),
            steals: num(r, iStl),
            blocks: num(r, iBlk),
            minutes: num(r, iMin),
            turnovers: num(r, iTO),
            fg_made: num(r, iFGM),
            fg_attempted: num(r, iFGA),
            ft_made: num(r, iFTM),
            ft_attempted: num(r, iFTA),
            three_made: num(r, i3M),
            three_attempted: num(r, i3A),
          };

          const { error: sErr } = await supabase.from("player_game_stats").insert(stat);
          if (sErr) {
            if (sErr.code === "23505") rowsSkipped++;
            else errors.push(`Stat row ${i}: ${sErr.message}`);
          } else {
            rowsInserted++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rows_parsed: dataRows.length,
        rows_inserted: rowsInserted,
        rows_skipped: rowsSkipped,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
