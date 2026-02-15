import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Import NBA player box score stats from the NBA.com fixed-width text format.
 * Format: DATE TM OPP NAME (POS) G MIN FG FGA FG3 F3A FT FTA OFF DEF TRB AST PF DQ STL TO BLK PTS
 */

// NBA team abbreviation normalization
const NBA_ABBR_MAP: Record<string, string> = {
  "LA-L": "LAL", "LA-C": "LAC", "GS": "GSW", "SA": "SAS",
  "NO": "NOP", "NY": "NYK", "PHO": "PHX", "Pho.": "PHX",
  // Already standard
  "ATL": "ATL", "BOS": "BOS", "BKN": "BKN", "CHA": "CHA",
  "CHI": "CHI", "CLE": "CLE", "DAL": "DAL", "DEN": "DEN",
  "DET": "DET", "GSW": "GSW", "HOU": "HOU", "IND": "IND",
  "LAC": "LAC", "LAL": "LAL", "MEM": "MEM", "MIA": "MIA",
  "MIL": "MIL", "MIN": "MIN", "NOP": "NOP", "NYK": "NYK",
  "OKC": "OKC", "ORL": "ORL", "PHI": "PHI", "PHX": "PHX",
  "POR": "POR", "SAC": "SAC", "SAS": "SAS", "TOR": "TOR",
  "UTA": "UTA", "WAS": "WAS",
};

function normAbbr(raw: string): string {
  const trimmed = raw.trim();
  return NBA_ABBR_MAP[trimmed] || trimmed;
}

function parseDate(raw: string): string {
  // "02/12/2026" → "2026-02-12"
  const parts = raw.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return raw;
}

function toInt(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const txtContent = file ? await file.text() : (formData.get("text") as string);
    if (!txtContent) throw new Error("No text data provided");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lines = txtContent.split(/\r?\n/).filter((l) => l.trim());

    // Find the header line
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].includes("DATE") && lines[i].includes("NAME") && lines[i].includes("PTS")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) throw new Error("Could not find header row (expected DATE...NAME...PTS)");

    // Parse header positions using fixed-width detection
    const header = lines[headerIdx];
    // We'll parse data lines by splitting on whitespace, but need to handle names with spaces
    // The format is fixed-width, so let's detect column positions from the header
    const colStarts = findColumnPositions(header);
    console.log(`[import-nba-boxscore] Header at line ${headerIdx}, ${lines.length - headerIdx - 1} data lines`);

    // Pre-fetch games and players
    const { data: games } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, league")
      .eq("league", "NBA");

    const gameIndex = new Map<string, string>();
    for (const g of games || []) {
      const d = g.start_time?.split("T")[0] || "";
      gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${d}`, g.id);
      // ±1 day for timezone
      if (d) {
        const dt = new Date(d);
        const prev = new Date(dt); prev.setDate(prev.getDate() - 1);
        const next = new Date(dt); next.setDate(next.getDate() + 1);
        const fmt = (dd: Date) => dd.toISOString().split("T")[0];
        if (!gameIndex.has(`${g.home_abbr}|${g.away_abbr}|${fmt(prev)}`))
          gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${fmt(prev)}`, g.id);
        if (!gameIndex.has(`${g.home_abbr}|${g.away_abbr}|${fmt(next)}`))
          gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${fmt(next)}`, g.id);
      }
    }

    const { data: existingPlayers } = await sb
      .from("players")
      .select("id, name, team, league")
      .eq("league", "NBA");

    const playerIndex = new Map<string, string>();
    for (const p of existingPlayers || []) {
      playerIndex.set(`${p.name}|${p.team}`, p.id);
      playerIndex.set(p.name, p.id); // fallback name-only
    }

    let statsInserted = 0;
    let playersCreated = 0;
    let gamesNotFound = 0;
    let statsSkipped = 0;
    const errors: string[] = [];
    const unmatchedGames: string[] = [];
    const statsBatch: any[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.startsWith("INCLUDES") || line.startsWith("---")) continue;

      const parsed = parseBoxScoreLine(line, colStarts);
      if (!parsed) continue;

      const team = normAbbr(parsed.tm);
      const opp = normAbbr(parsed.opp);
      const dateStr = parseDate(parsed.date);
      const name = parsed.name;
      const pos = parsed.pos;

      if (!name || !team) continue;

      // Find or create player
      let playerId = playerIndex.get(`${name}|${team}`) || playerIndex.get(name);
      if (!playerId) {
        const { data: newP, error: pErr } = await sb
          .from("players")
          .insert({ name, team, league: "NBA", position: pos || null, natal_data_quality: "C" })
          .select("id")
          .single();
        if (pErr) { errors.push(`Row ${i}: player insert: ${pErr.message}`); continue; }
        playerId = newP.id;
        playerIndex.set(`${name}|${team}`, playerId);
        playerIndex.set(name, playerId);
        playersCreated++;
      }

      // Match game — try both orientations (TM@OPP and OPP@TM)
      let gameId = gameIndex.get(`${team}|${opp}|${dateStr}`)
        || gameIndex.get(`${opp}|${team}|${dateStr}`);

      if (!gameId) {
        gamesNotFound++;
        const key = `${team}v${opp} ${dateStr}`;
        if (!unmatchedGames.includes(key) && unmatchedGames.length < 10) {
          unmatchedGames.push(key);
        }
        statsSkipped++;
        continue;
      }

      // Determine if player was a starter
      const starter = pos !== "SUB" && pos !== null;

      statsBatch.push({
        player_id: playerId,
        game_id: gameId,
        team_abbr: team,
        league: "NBA",
        minutes: toInt(parsed.min),
        fg_made: toInt(parsed.fg),
        fg_attempted: toInt(parsed.fga),
        three_made: toInt(parsed.fg3),
        three_attempted: toInt(parsed.f3a),
        ft_made: toInt(parsed.ft),
        ft_attempted: toInt(parsed.fta),
        off_rebounds: toInt(parsed.off),
        def_rebounds: toInt(parsed.def),
        rebounds: toInt(parsed.trb),
        assists: toInt(parsed.ast),
        fouls: toInt(parsed.pf),
        steals: toInt(parsed.stl),
        turnovers: toInt(parsed.to),
        blocks: toInt(parsed.blk),
        points: toInt(parsed.pts),
        starter,
      });
    }

    // Batch upsert
    const batchSize = 100;
    for (let i = 0; i < statsBatch.length; i += batchSize) {
      const batch = statsBatch.slice(i, i + batchSize);
      const { error } = await sb.from("player_game_stats").upsert(batch, { onConflict: "game_id,player_id" });
      if (error) {
        errors.push(`Stats batch at ${i}: ${error.message}`);
      } else {
        statsInserted += batch.length;
      }
    }

    console.log(`[import-nba-boxscore] Done: ${statsInserted} inserted, ${playersCreated} players, ${gamesNotFound} unmatched`);

    return new Response(
      JSON.stringify({
        success: true,
        rows_parsed: statsBatch.length + statsSkipped,
        stats_inserted: statsInserted,
        players_created: playersCreated,
        games_not_found: gamesNotFound,
        stats_skipped: statsSkipped,
        unmatched_games_sample: unmatchedGames,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-nba-boxscore-txt error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ColPositions {
  date: number;
  tm: number;
  opp: number;
  name: number;
  pos: number;
  g: number;
  min: number;
  stats: number; // start of FG column
}

function findColumnPositions(header: string): ColPositions {
  return {
    date: header.indexOf("DATE"),
    tm: header.indexOf("TM"),
    opp: header.indexOf("OPP"),
    name: header.indexOf("NAME"),
    pos: header.indexOf("(POS)"),
    g: header.indexOf("  G "),
    min: header.indexOf("MIN"),
    stats: header.indexOf("FG "),
  };
}

interface ParsedLine {
  date: string; tm: string; opp: string; name: string; pos: string;
  min: string; fg: string; fga: string; fg3: string; f3a: string;
  ft: string; fta: string; off: string; def: string; trb: string;
  ast: string; pf: string; dq: string; stl: string; to: string;
  blk: string; pts: string;
}

function parseBoxScoreLine(line: string, _cols: ColPositions): ParsedLine | null {
  // The format is mostly space-separated but names can contain spaces.
  // Strategy: match known patterns with regex
  // Format: DATE TM OPP Name, First (POS) G MIN FG FGA FG3 F3A FT FTA OFF DEF TRB AST PF DQ STL TO BLK PTS
  const match = line.match(
    /^(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\S+)\s+(.+?)\s+\((\w+\s*)\)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/
  );
  if (!match) return null;

  return {
    date: match[1],
    tm: match[2],
    opp: match[3],
    name: match[4].trim(),
    pos: match[5].trim(),
    // match[6] = G (always 1)
    min: match[7],
    fg: match[8],
    fga: match[9],
    fg3: match[10],
    f3a: match[11],
    ft: match[12],
    fta: match[13],
    off: match[14],
    def: match[15],
    trb: match[16],
    ast: match[17],
    pf: match[18],
    dq: match[19],
    stl: match[20],
    to: match[21],
    blk: match[22],
    pts: match[23],
  };
}
