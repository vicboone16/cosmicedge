import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Import ESPN-format NBA box scores from client-side parsed XLSX JSON.
 * Expects JSON body: { rows: [ { event_id, game_date, team_abbr, player_name, ... } ] }
 * Split stats like FG "8-13" are parsed client-side into fg_made/fg_attempted.
 */

const NBA_ABBR_MAP: Record<string, string> = {
  "GS": "GSW", "SA": "SAS", "NO": "NOP", "NY": "NYK",
  "PHO": "PHX", "LA-L": "LAL", "LA-C": "LAC",
};

function normAbbr(raw: string): string {
  const t = raw?.trim()?.toUpperCase();
  return NBA_ABBR_MAP[t] || t;
}

function normalizeName(name: string): string {
  if (!name) return name;
  if (name.includes(",")) {
    return name.split(",").map(s => s.trim()).reverse().join(" ");
  }
  return name.trim();
}

function splitStat(val: string | number | null | undefined): { made: number | null; attempted: number | null } {
  if (val == null || val === "") return { made: null, attempted: null };
  const s = String(val);
  const parts = s.split("-");
  if (parts.length === 2) {
    const made = parseInt(parts[0], 10);
    const attempted = parseInt(parts[1], 10);
    return { made: isNaN(made) ? null : made, attempted: isNaN(attempted) ? null : attempted };
  }
  return { made: null, attempted: null };
}

function toInt(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows } = await req.json();
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("No rows provided. Expected JSON body with { rows: [...] }");
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log(`[import-nba-boxscore-xlsx] Processing ${rows.length} rows`);

    // Pre-fetch games and players
    const { data: games } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, league")
      .eq("league", "NBA");

    const gameIndex = new Map<string, string>();
    for (const g of games || []) {
      const d = g.start_time?.split("T")[0] || "";
      gameIndex.set(`${g.home_abbr}|${g.away_abbr}|${d}`, g.id);
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
      playerIndex.set(p.name, p.id);
    }

    // Group rows by event_id to determine home/away
    const eventGroups = new Map<string, any[]>();
    for (const row of rows) {
      const eid = String(row.event_id || "");
      if (!eid) continue;
      if (!eventGroups.has(eid)) eventGroups.set(eid, []);
      eventGroups.get(eid)!.push(row);
    }

    // Build a map: event_id -> { teams: [team1, team2], date }
    const eventTeams = new Map<string, { teams: string[]; date: string }>();
    for (const [eid, eRows] of eventGroups) {
      const teams = [...new Set(eRows.map((r: any) => normAbbr(r.team_abbr)))];
      // Parse date from game_date (ISO format like "2025-11-01T21:00Z")
      const rawDate = eRows[0].game_date || "";
      const date = rawDate.split("T")[0];
      eventTeams.set(eid, { teams, date });
    }

    let statsInserted = 0;
    let playersCreated = 0;
    let gamesNotFound = 0;
    let statsSkipped = 0;
    const errors: string[] = [];
    const unmatchedGames: string[] = [];
    const statsBatch: any[] = [];

    for (const row of rows) {
      const dnp = row.did_not_play === true || row.did_not_play === "TRUE" || row.did_not_play === "true";
      if (dnp) { statsSkipped++; continue; }

      const team = normAbbr(row.team_abbr);
      const name = normalizeName(row.player_name);
      const pos = row.pos || null;

      if (!name || !team) { statsSkipped++; continue; }

      // Find or create player
      let playerId = playerIndex.get(`${name}|${team}`) || playerIndex.get(name);
      if (!playerId) {
        const { data: newP, error: pErr } = await sb
          .from("players")
          .insert({ name, team, league: "NBA", position: pos, natal_data_quality: "C" })
          .select("id")
          .single();
        if (pErr) { errors.push(`Player insert ${name}: ${pErr.message}`); continue; }
        playerId = newP.id;
        playerIndex.set(`${name}|${team}`, playerId);
        playerIndex.set(name, playerId);
        playersCreated++;
      }

      // Match game using event_id grouping
      const eid = String(row.event_id || "");
      const eventInfo = eventTeams.get(eid);
      let gameId: string | undefined;

      if (eventInfo && eventInfo.teams.length >= 2) {
        const [t1, t2] = eventInfo.teams;
        const d = eventInfo.date;
        // Try both orientations
        gameId = gameIndex.get(`${t1}|${t2}|${d}`)
          || gameIndex.get(`${t2}|${t1}|${d}`);
      }

      if (!gameId) {
        gamesNotFound++;
        const key = `${team} ${eventInfo?.date || "?"}`;
        if (!unmatchedGames.includes(key) && unmatchedGames.length < 20) {
          unmatchedGames.push(key);
        }
        statsSkipped++;
        continue;
      }

      // Parse split stats
      const fg = splitStat(row.FG);
      const three = splitStat(row["3PT"]);
      const ft = splitStat(row.FT);

      const starter = row.starter === true || row.starter === "TRUE" || row.starter === "true";

      statsBatch.push({
        player_id: playerId,
        game_id: gameId,
        team_abbr: team,
        league: "NBA",
        minutes: toInt(row.MIN),
        fg_made: fg.made,
        fg_attempted: fg.attempted,
        three_made: three.made,
        three_attempted: three.attempted,
        ft_made: ft.made,
        ft_attempted: ft.attempted,
        off_rebounds: toInt(row.OREB),
        def_rebounds: toInt(row.DREB),
        rebounds: toInt(row.REB),
        assists: toInt(row.AST),
        steals: toInt(row.STL),
        blocks: toInt(row.BLK),
        turnovers: toInt(row.TO),
        fouls: toInt(row.PF),
        plus_minus: toInt(row["Plus-Minus"]),
        points: toInt(row.PTS),
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

    console.log(`[import-nba-boxscore-xlsx] Done: ${statsInserted} inserted, ${playersCreated} players, ${gamesNotFound} unmatched`);

    return new Response(
      JSON.stringify({
        success: true,
        rows_parsed: rows.length,
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
    console.error("import-nba-boxscore-xlsx error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
