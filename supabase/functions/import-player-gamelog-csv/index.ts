import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Import NFL (or any league) player game stats from CSV.
 * Also auto-creates player records if they don't exist.
 *
 * Expected CSV columns (flexible naming):
 *   Name, Team, DateTime PST (or Date), HomeTeam, AwayTeam,
 *   Targets, ReceivingYards, ReceivingTouchdowns,
 *   PassingAttempts, Completions, PassingYards, PassingTouchdowns,
 *   RushingAttempts, RushingYards, RushingTouchdowns
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const league = (formData.get("league") as string || "NFL").toUpperCase();
    const file = formData.get("file") as File | null;
    const csvText = file ? await file.text() : (formData.get("csv") as string);
    if (!csvText) throw new Error("No CSV data provided");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Parse CSV ──────────────────────────────────────────────────
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("CSV must have a header row + data");

    const rawHeaders = parseCSVLine(lines[0]);
    const colMap = mapColumns(rawHeaders);
    console.log(`[import-player-gamelog] Mapped columns:`, JSON.stringify(colMap));

    // ── Pre-fetch existing players for this league ─────────────────
    const { data: existingPlayers } = await sb
      .from("players")
      .select("id, name, team, league")
      .eq("league", league);

    const playerIndex = new Map<string, string>(); // "name|team" → id
    for (const p of existingPlayers || []) {
      playerIndex.set(`${p.name}|${p.team}`, p.id);
    }

    // ── Pre-fetch games for matching ───────────────────────────────
    const { data: games } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, league")
      .eq("league", league);

    const gameIndex = new Map<string, string>(); // "home|away|date" → id
    for (const g of games || []) {
      const d = g.start_time?.split("T")[0] || "";
      gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${d}`, g.id);
    }

    let playersCreated = 0;
    let statsInserted = 0;
    let statsSkipped = 0;
    let gameNotFound = 0;
    const errors: string[] = [];

    const statsBatch: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      if (vals.length < 3) continue;

      const row = mapRow(colMap, vals);
      const name = row.name?.trim();
      const team = row.team?.trim()?.toUpperCase();
      if (!name || !team) continue;

      // ── Ensure player exists ──────────────────────────────────────
      const pKey = `${name}|${team}`;
      let playerId = playerIndex.get(pKey);
      if (!playerId) {
        // Try name-only match (player may have changed teams)
        for (const [k, v] of playerIndex) {
          if (k.startsWith(`${name}|`)) { playerId = v; break; }
        }
      }
      if (!playerId) {
        const { data: newP, error: pErr } = await sb
          .from("players")
          .insert({ name, team, league, natal_data_quality: "C" })
          .select("id")
          .single();
        if (pErr) { errors.push(`Row ${i}: player insert: ${pErr.message}`); continue; }
        playerId = newP.id;
        playerIndex.set(pKey, playerId);
        playersCreated++;
      }

      // ── Match game ────────────────────────────────────────────────
      const homeTeam = row.home_team?.trim()?.toUpperCase();
      const awayTeam = row.away_team?.trim()?.toUpperCase();
      const dateStr = parseDate(row.datetime);

      let gameId: string | undefined;
      if (homeTeam && awayTeam && dateStr) {
        gameId = gameIndex.get(`${homeTeam}|${awayTeam}|${dateStr}`);
      }

      if (!gameId) {
        gameNotFound++;
        // Still insert stats without game link if we can't match
      }

      // ── Build stat record ─────────────────────────────────────────
      const stat: any = {
        player_id: playerId,
        team_abbr: team,
        league,
        game_id: gameId || null,
        targets: toInt(row.targets),
        receiving_yards: toInt(row.receiving_yards),
        receiving_touchdowns: toInt(row.receiving_touchdowns),
        passing_attempts: toInt(row.passing_attempts),
        completions: toInt(row.completions),
        passing_yards: toInt(row.passing_yards),
        passing_touchdowns: toInt(row.passing_touchdowns),
        rushing_attempts: toInt(row.rushing_attempts),
        rushing_yards: toInt(row.rushing_yards),
        rushing_touchdowns: toInt(row.rushing_touchdowns),
      };

      if (!stat.game_id) {
        // Can't upsert without game_id (it's required), skip
        statsSkipped++;
        continue;
      }

      statsBatch.push(stat);
    }

    // ── Batch insert stats ──────────────────────────────────────────
    const batchSize = 100;
    for (let i = 0; i < statsBatch.length; i += batchSize) {
      const batch = statsBatch.slice(i, i + batchSize);
      const { error } = await sb.from("player_game_stats").insert(batch);
      if (error) {
        errors.push(`Stats batch at ${i}: ${error.message}`);
      } else {
        statsInserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        league,
        rows_parsed: lines.length - 1,
        players_created: playersCreated,
        stats_inserted: statsInserted,
        stats_skipped: statsSkipped,
        games_not_found: gameNotFound,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-player-gamelog-csv error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (["name", "player", "playername"].includes(h)) map.name = i;
    else if (["team", "teamabbr", "tm"].includes(h)) map.team = i;
    else if (["datetimepst", "datetime", "date", "gamedate"].includes(h)) map.datetime = i;
    else if (["hometeam", "home"].includes(h)) map.home_team = i;
    else if (["awayteam", "away", "visitor"].includes(h)) map.away_team = i;
    else if (h === "targets" || h === "tgt") map.targets = i;
    else if (["receivingyards", "recyds", "recyd", "receivingyd"].includes(h)) map.receiving_yards = i;
    else if (["receivingtouchdowns", "rectd", "rectds", "receivingtd"].includes(h)) map.receiving_touchdowns = i;
    else if (["passingattempts", "passatt", "att"].includes(h)) map.passing_attempts = i;
    else if (["completions", "comp", "cmp"].includes(h)) map.completions = i;
    else if (["passingyards", "passyds", "passyd"].includes(h)) map.passing_yards = i;
    else if (["passingtouchdowns", "passtd", "passtds"].includes(h)) map.passing_touchdowns = i;
    else if (["rushingattempts", "rushatt", "carries", "car"].includes(h)) map.rushing_attempts = i;
    else if (["rushingyards", "rushyds", "rushyd"].includes(h)) map.rushing_yards = i;
    else if (["rushingtouchdowns", "rushtd", "rushtds"].includes(h)) map.rushing_touchdowns = i;
  }
  return map;
}

function mapRow(colMap: Record<string, number>, vals: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [key, idx] of Object.entries(colMap)) {
    row[key] = vals[idx] || "";
  }
  return row;
}

function parseDate(raw: string | undefined): string {
  if (!raw) return "";
  // Handle "MM/DD/YYYY HH:MM" or "YYYY-MM-DD" or "MM/DD/YYYY"
  const cleaned = raw.split(" ")[0]; // drop time portion
  if (cleaned.includes("/")) {
    const [m, d, y] = cleaned.split("/");
    if (y && m && d) return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (cleaned.match(/^\d{4}-\d{2}-\d{2}$/)) return cleaned;
  return "";
}

function toInt(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
