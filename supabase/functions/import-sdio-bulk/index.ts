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

// Reverse lookup: full team name → abbr
const NAME_TO_ABBR: Record<string, string> = {};
for (const t of Object.values(SDIO_TEAMS)) {
  NAME_TO_ABBR[t.full] = t.abbr;
}

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
    const { action, records, league = "NBA" } = body;
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

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
      // Group TeamGame records by GameID, extract home/away scores
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

      // Fetch game IDs
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
