import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NBA_ABBR_MAP: Record<string, string> = {
  "GS": "GSW", "SA": "SAS", "NO": "NOP", "NY": "NYK",
  "PHO": "PHX", "LA-L": "LAL", "LA-C": "LAC",
  "WSH": "WAS", "UTAH": "UTA",
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

function parseDate(raw: any): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && raw > 10000 && raw < 100000) {
    const d = new Date((raw - 25569) * 86400000);
    return d.toISOString().split("T")[0];
  }
  // Date object (from cellDates: true)
  if (raw instanceof Date || (typeof raw === "object" && raw.getTime)) {
    return raw.toISOString().split("T")[0];
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  const usParts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usParts) {
    const y = usParts[3].length === 2 ? `20${usParts[3]}` : usParts[3];
    return `${y}-${usParts[1].padStart(2, "0")}-${usParts[2].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return s;
}

/** Shift a date string by N days */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows } = await req.json();
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("No rows provided");
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log(`[import-nba-boxscore-xlsx] Processing ${rows.length} rows`);

    // Fetch ALL NBA games (default limit is 1000, we need all)
    const allGames: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page } = await sb
        .from("games")
        .select("id, home_abbr, away_abbr, start_time, league")
        .eq("league", "NBA")
        .range(from, from + pageSize - 1);
      if (!page || page.length === 0) break;
      allGames.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    const games = allGames;
    console.log(`[import-nba-boxscore-xlsx] Loaded ${games.length} NBA games from DB`);

    // Build EXACT-date indexes only (no ±1 day pollution)
    // matchup index: "home|away|date" -> game_id
    const matchupIndex = new Map<string, string>();
    // team-date index: "team|date" -> game_id[]
    const teamDateExact = new Map<string, string[]>();

    const addTD = (team: string, date: string, id: string) => {
      const key = `${team}|${date}`;
      if (!teamDateExact.has(key)) teamDateExact.set(key, []);
      const arr = teamDateExact.get(key)!;
      if (!arr.includes(id)) arr.push(id);
    };

    for (const g of games) {
      const d = g.start_time?.split("T")[0] || "";
      if (!d) continue;
      matchupIndex.set(`${g.home_abbr}|${g.away_abbr}|${d}`, g.id);
      addTD(g.home_abbr, d, g.id);
      addTD(g.away_abbr, d, g.id);
    }

    /** Try to find a game for two teams on a date, with optional ±1 day fallback */
    function findGameByMatchup(t1: string, t2: string, date: string): string | undefined {
      // Exact date, both orientations
      let id = matchupIndex.get(`${t1}|${t2}|${date}`) || matchupIndex.get(`${t2}|${t1}|${date}`);
      if (id) return id;
      // ±1 day
      for (const offset of [-1, 1]) {
        const d2 = shiftDate(date, offset);
        id = matchupIndex.get(`${t1}|${t2}|${d2}`) || matchupIndex.get(`${t2}|${t1}|${d2}`);
        if (id) return id;
      }
      return undefined;
    }

    /** Find a game for a single team on a date (exact only, must be unique) */
    function findGameBySingleTeam(team: string, date: string): string | undefined {
      const candidates = teamDateExact.get(`${team}|${date}`) || [];
      if (candidates.length === 1) return candidates[0];
      return undefined;
    }

    // Pre-fetch players
    const { data: existingPlayers } = await sb
      .from("players")
      .select("id, name, team, league")
      .eq("league", "NBA");

    const playerIndex = new Map<string, string>();
    for (const p of existingPlayers || []) {
      playerIndex.set(`${p.name}|${p.team}`, p.id);
      playerIndex.set(p.name, p.id);
    }

    // Group rows by event_id to determine opponents
    const eventGroups = new Map<string, any[]>();
    for (const row of rows) {
      const eid = String(row.event_id || "");
      if (!eid) continue;
      if (!eventGroups.has(eid)) eventGroups.set(eid, []);
      eventGroups.get(eid)!.push(row);
    }

    const eventTeams = new Map<string, { teams: string[]; date: string }>();
    for (const [eid, eRows] of eventGroups) {
      const teams = [...new Set(eRows.map((r: any) => normAbbr(r.team_abbr)))];
      const date = parseDate(eRows[0].game_date);
      eventTeams.set(eid, { teams, date });
    }

    let statsInserted = 0;
    let playersCreated = 0;
    let gamesNotFound = 0;
    let statsSkipped = 0;
    const errors: string[] = [];
    const unmatchedGames: string[] = [];
    const statsBatch: any[] = [];
    // Track keys to prevent duplicates within a batch
    const seenKeys = new Set<string>();

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

      // Match game
      const eid = String(row.event_id || "");
      const eventInfo = eventTeams.get(eid);
      const rowDate = parseDate(row.game_date);
      const matchDate = eventInfo?.date || rowDate;
      let gameId: string | undefined;

      // Strategy 1: Use event grouping if we have exactly 2 teams
      if (eventInfo && eventInfo.teams.length === 2) {
        gameId = findGameByMatchup(eventInfo.teams[0], eventInfo.teams[1], matchDate);
      }

      // Strategy 2: If event has >2 teams (bad grouping) or no event, try to find opponent from event
      if (!gameId && eventInfo && eventInfo.teams.length > 2) {
        // Try each other team as potential opponent
        for (const otherTeam of eventInfo.teams) {
          if (otherTeam === team) continue;
          gameId = findGameByMatchup(team, otherTeam, matchDate);
          if (gameId) break;
        }
      }

      // Strategy 3: Single-team exact-date (only if unique game for that team on that date)
      if (!gameId && matchDate) {
        gameId = findGameBySingleTeam(team, matchDate);
      }

      if (!gameId) {
        gamesNotFound++;
        const key = `${team} ${matchDate || "?"}`;
        if (!unmatchedGames.includes(key) && unmatchedGames.length < 20) {
          unmatchedGames.push(key);
        }
        statsSkipped++;
        continue;
      }

      // Deduplicate within batch
      const batchKey = `${gameId}|${playerId}|full`;
      if (seenKeys.has(batchKey)) {
        statsSkipped++;
        continue;
      }
      seenKeys.add(batchKey);

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
      const { error } = await sb.from("player_game_stats").upsert(batch, { onConflict: "game_id,player_id,period" });
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
