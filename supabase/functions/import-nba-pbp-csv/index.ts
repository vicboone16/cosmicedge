import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Check admin
    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { csv } = await req.json();
    if (!csv) throw new Error("No csv provided");

    // Input validation: size limit (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (typeof csv === "string" && csv.length > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "CSV data too large. Maximum 10MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse CSV
    const lines = csv.split("\n").filter((l: string) => l.trim());

    // Input validation: row count limit
    const MAX_ROWS = 100000;
    if (lines.length > MAX_ROWS) {
      return new Response(JSON.stringify({ error: `Too many rows. Maximum ${MAX_ROWS}.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const headers = parseCSVLine(lines[0]);

    const rows: any[] = [];
    let gameId = "";
    let awayTeam = "";
    let homeTeam = "";
    let gameDate = "";

    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      if (vals.length < headers.length) continue;

      const row: Record<string, any> = {};
      headers.forEach((h: string, idx: number) => {
        row[h] = vals[idx] || null;
      });

      if (!gameId && row.game_id) gameId = String(row.game_id);
      if (!awayTeam && row.away_team) awayTeam = row.away_team;
      if (!homeTeam && row.home_team) homeTeam = row.home_team;
      if (!gameDate && row.date) gameDate = row.date;

      rows.push({
        game_id: String(row.game_id),
        play_id: parseInt(row.play_id),
        data_set: row.data_set,
        date: row.date || null,
        a1: row.a1, a2: row.a2, a3: row.a3, a4: row.a4, a5: row.a5,
        h1: row.h1, h2: row.h2, h3: row.h3, h4: row.h4, h5: row.h5,
        period: row.period ? parseInt(row.period) : null,
        away_score: row.away_score ? parseInt(row.away_score) : null,
        home_score: row.home_score ? parseInt(row.home_score) : null,
        remaining_time: row.remaining_time,
        elapsed: row.elapsed,
        play_length: row.play_length,
        team: row.team,
        event_type: row.event_type,
        assist: row.assist,
        away: row.away,
        home: row.home,
        block: row.block,
        entered: row.entered,
        left_player: row.left,
        num: row.num,
        opponent: row.opponent,
        outof: row.outof,
        player: row.player,
        points: row.points ? parseInt(row.points) : null,
        possession: row.possession,
        reason: row.reason,
        result: row.result,
        steal: row.steal,
        type: row.type,
        shot_distance: row.shot_distance ? parseFloat(row.shot_distance) : null,
        original_x: row.original_x ? parseFloat(row.original_x) : null,
        original_y: row.original_y ? parseFloat(row.original_y) : null,
        description: row.description,
        away_team: row.away_team,
        home_team: row.home_team,
        team_possession: row.team_possession,
        time_actual: row.time_actual || null,
        qualifiers1: row.qualifiers1,
        qualifiers2: row.qualifiers2,
        qualifiers3: row.qualifiers3,
        qualifiers4: row.qualifiers4,
        area: row.area,
        area_detail: row.area_detail,
        official: row.official,
      });
    }

    if (!rows.length) throw new Error("No rows parsed from CSV");

    // Deduplicate by (game_id, play_id) — keep last occurrence
    const seen = new Map<string, number>();
    const deduped: any[] = [];
    for (const r of rows) {
      const key = `${r.game_id}::${r.play_id}`;
      if (seen.has(key)) {
        deduped[seen.get(key)!] = r; // overwrite earlier
      } else {
        seen.set(key, deduped.length);
        deduped.push(r);
      }
    }

    // Delete existing data for this game first
    await sb.from("nba_play_by_play_events").delete().eq("game_id", gameId);

    // Insert in batches of 200
    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const batch = deduped.slice(i, i + BATCH);
      const { error } = await sb.from("nba_play_by_play_events").upsert(batch, { onConflict: "game_id,play_id" });
      if (error) throw new Error(`Batch insert error: ${error.message}`);
      inserted += batch.length;
    }

    // Get final score from last row
    const lastRow = deduped[deduped.length - 1];
    const finalScore = `${lastRow.away_score ?? "?"}-${lastRow.home_score ?? "?"}`;
    const periods = new Set(deduped.map(r => r.period).filter(Boolean));

    return new Response(JSON.stringify({
      status: "success",
      game_id: gameId,
      away_team: awayTeam,
      home_team: homeTeam,
      date: gameDate,
      plays_imported: inserted,
      periods: periods.size,
      final_score: `${awayTeam} ${finalScore} ${homeTeam}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}
