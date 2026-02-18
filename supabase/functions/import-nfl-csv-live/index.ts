/**
 * import-nfl-csv-live
 * Fetches the NFL CSV from the published app URL (or a provided url param),
 * parses it, and upserts all final games into the database — updating existing
 * scheduled stub rows with real scores and marking them as final.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

function parseDate(dateStr: string, timeStr: string): string {
  // dateStr like "9/7/25", timeStr like "8:20PM"
  const [month, day, year] = dateStr.split("/").map(Number);
  const fullYear = year < 100 ? 2000 + year : year;

  let hours = 0, minutes = 0;
  if (timeStr) {
    const isPM = timeStr.toUpperCase().includes("PM");
    const isAM = timeStr.toUpperCase().includes("AM");
    const timePart = timeStr.replace(/[APM]/gi, "").trim();
    const [h, m] = timePart.split(":").map(Number);
    hours = h + (isPM && h !== 12 ? 12 : 0) + (isAM && h === 12 ? -12 : 0);
    minutes = m || 0;
  }

  // NFL times are ET — convert to UTC (ET = UTC-5 standard, UTC-4 EDT)
  // Games Sep–Jan: mostly EDT in early season, EST later. Use UTC-5 as safe approximation.
  const etOffsetMs = 5 * 60 * 60 * 1000;
  const localMs = Date.UTC(fullYear, month - 1, day, hours, minutes, 0);
  return new Date(localMs + etOffsetMs).toISOString();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Strip BOM
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = headerLine.split(",").map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] || "").trim(); });
    return row;
  }).filter(r => r.Date && r.AwayTeam && r.HomeTeam);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Allow passing a custom CSV URL; default to the published app's public data
    const csvUrl = body.url || "https://cosmicedge.lovable.app/data/nfl_25-26_games.csv";

    const log: string[] = [];
    log.push(`Fetching NFL CSV from: ${csvUrl}`);

    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`Failed to fetch CSV: ${resp.status} ${resp.statusText}`);
    const csvText = await resp.text();

    const rows = parseCSV(csvText);
    log.push(`Parsed ${rows.length} rows from CSV`);

    // Build game records from CSV
    interface GameRecord {
      home_team: string;
      away_team: string;
      home_abbr: string;
      away_abbr: string;
      home_score: number | null;
      away_score: number | null;
      start_time: string;
      status: string;
      league: string;
      source: string;
    }
    const games: GameRecord[] = [];
    let parseErrors = 0;

    for (const row of rows) {
      const homeName = row.HomeTeam?.trim();
      const awayName = row.AwayTeam?.trim();
      if (!homeName || !awayName) continue;

      const homeAbbr = NFL_TEAMS[homeName];
      const awayAbbr = NFL_TEAMS[awayName];
      if (!homeAbbr || !awayAbbr) {
        log.push(`  No mapping: "${homeName}" or "${awayName}"`);
        parseErrors++;
        continue;
      }

      const homeScore = row.HomeScore !== "" ? parseInt(row.HomeScore) : null;
      const awayScore = row.AwayScore !== "" ? parseInt(row.AwayScore) : null;
      const status = (row.Status || "scheduled").toLowerCase().trim();
      const startTime = parseDate(row.Date, row.Time);

      games.push({
        home_team: homeName,
        away_team: awayName,
        home_abbr: homeAbbr,
        away_abbr: awayAbbr,
        home_score: homeScore,
        away_score: awayScore,
        start_time: startTime,
        status: homeScore !== null && awayScore !== null ? "final" : status,
        league: "NFL",
        source: "csv",
      });
    }

    log.push(`Built ${games.length} valid game records (${parseErrors} skipped)`);

    // Pre-fetch existing NFL games scoped to the 2025-26 season only
    // (Sep 2025 – Feb 2026) to avoid cross-season false matches
    const allExisting: any[] = [];
    let page = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, home_score, away_score, status, source")
        .eq("league", "NFL")
        .gte("start_time", "2025-09-01T00:00:00Z")
        .lte("start_time", "2026-03-01T00:00:00Z")
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!batch || batch.length === 0) break;
      allExisting.push(...batch);
      if (batch.length < 1000) break;
      page++;
    }
    log.push(`Found ${allExisting.length} existing NFL games in DB`);

    // Build lookup: homeAbbr|awayAbbr|date → game
    const existingIndex = new Map<string, any>();
    for (const g of allExisting) {
      const d = g.start_time.split("T")[0];
      const dt = new Date(d);
      for (let delta = -1; delta <= 1; delta++) {
        const shifted = new Date(dt.getTime() + delta * 86400000).toISOString().split("T")[0];
        const key = `${g.home_abbr}|${g.away_abbr}|${shifted}`;
        if (!existingIndex.has(key)) existingIndex.set(key, g);
      }
    }

    // Categorize each CSV game as update or insert
    const toUpdate: { id: string; home_score: number | null; away_score: number | null; status: string; source: string }[] = [];
    const toInsert: GameRecord[] = [];

    for (const g of games) {
      const dateStr = g.start_time.split("T")[0];
      const key = `${g.home_abbr}|${g.away_abbr}|${dateStr}`;
      const existing = existingIndex.get(key);

      if (existing) {
        // Update if: has scores from CSV and existing lacks them, OR status differs
        const needsUpdate =
          (g.home_score !== null && g.away_score !== null &&
            (existing.home_score !== g.home_score || existing.away_score !== g.away_score || existing.status !== "final"));

        if (needsUpdate) {
          toUpdate.push({
            id: existing.id,
            home_score: g.home_score,
            away_score: g.away_score,
            status: "final",
            source: "csv",
          });
        }
      } else {
        toInsert.push(g);
      }
    }

    log.push(`${toUpdate.length} games to update (scores/status), ${toInsert.length} new games to insert`);

    // Execute updates in parallel batches of 50
    let updated = 0;
    const BATCH = 50;
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(u =>
          supabase.from("games").update({
            home_score: u.home_score,
            away_score: u.away_score,
            status: u.status,
            source: u.source,
          }).eq("id", u.id)
        )
      );
      updated += results.filter((r: any) => !r.error).length;
    }
    log.push(`✅ Updated ${updated} games`);

    // Insert new games in batches of 100
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { data, error } = await supabase.from("games").insert(batch).select("id");
      if (error) {
        log.push(`❌ Insert error: ${error.message}`);
      } else {
        inserted += data?.length || batch.length;
      }
    }
    log.push(`✅ Inserted ${inserted} new games`);

    return new Response(
      JSON.stringify({ success: true, updated, inserted, log }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("import-nfl-csv-live error:", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
