import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeAbbr } from "../_shared/team-mappings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Import NBA player game logs from Basketball Reference HTML exports.
 * Accepts one or more files, each with a player_name field.
 * Parses data-stat attributes from HTML table rows.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const entries: { player_name: string; team_abbr?: string; html_content: string }[] =
      Array.isArray(body) ? body : [body];

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalPlayersCreated = 0;
    let totalGamesNotFound = 0;
    const allErrors: string[] = [];
    const playerResults: { player: string; inserted: number; skipped: number }[] = [];

    for (const entry of entries) {
      const { player_name, team_abbr: rawTeam, html_content } = entry;
      if (!player_name || !html_content) {
        allErrors.push(`Missing player_name or html_content`);
        continue;
      }

      // Log first 500 chars of HTML for debugging structure
      console.log(`[import-player-gamelog-html] ${player_name}: HTML length=${html_content.length}, first 500 chars: ${html_content.substring(0, 500)}`);
      const rows = parsePlayerGameLog(html_content);
      console.log(`[import-player-gamelog-html] ${player_name}: ${rows.length} game rows parsed`);
      if (rows.length > 0) {
        console.log(`[import-player-gamelog-html] First row keys: ${Object.keys(rows[0]).join(", ")}`);
        console.log(`[import-player-gamelog-html] First row: ${JSON.stringify(rows[0])}`);
      }
      if (rows.length === 0) {
        // Check what <tr> tags exist
        const trCount = (html_content.match(/<tr/gi) || []).length;
        const dataRowCount = (html_content.match(/<tr\s+data-row/gi) || []).length;
        const dataStatCount = (html_content.match(/data-stat/gi) || []).length;
        console.log(`[import-player-gamelog-html] ${player_name}: trCount=${trCount}, dataRowCount=${dataRowCount}, dataStatCount=${dataStatCount}`);
      }

      if (rows.length === 0) {
        allErrors.push(`${player_name}: No game rows found in HTML`);
        continue;
      }

      // Detect team from first row if not provided
      const teamRaw = rawTeam || rows[0].team_name_abbr;
      let teamAbbr: string;
      try {
        teamAbbr = normalizeAbbr("NBA", teamRaw);
      } catch {
        teamAbbr = teamRaw?.toUpperCase() || "UNK";
      }

      // Find or create player
      let playerId: string | null = null;
      const { data: existingPlayers } = await sb
        .from("players")
        .select("id, team")
        .eq("name", player_name)
        .eq("league", "NBA")
        .limit(1);

      if (existingPlayers && existingPlayers.length > 0) {
        playerId = existingPlayers[0].id;
      } else {
        const { data: newP, error: pErr } = await sb
          .from("players")
          .insert({ name: player_name, team: teamAbbr, league: "NBA", natal_data_quality: "C" })
          .select("id")
          .single();
        if (pErr) {
          allErrors.push(`${player_name}: create player failed: ${pErr.message}`);
          continue;
        }
        playerId = newP.id;
        totalPlayersCreated++;
      }

      let inserted = 0;
      let skipped = 0;

      for (const row of rows) {
        const gameDate = row.date;
        if (!gameDate) { skipped++; continue; }

        const isAway = row.game_location === "@";
        let oppAbbr: string;
        try {
          oppAbbr = normalizeAbbr("NBA", row.opp_name_abbr);
        } catch {
          oppAbbr = row.opp_name_abbr?.toUpperCase() || "";
        }

        // Determine team for this game row (player may have been traded)
        let rowTeam: string;
        try {
          rowTeam = normalizeAbbr("NBA", row.team_name_abbr);
        } catch {
          rowTeam = teamAbbr;
        }

        const homeAbbr = isAway ? oppAbbr : rowTeam;
        const awayAbbr = isAway ? rowTeam : oppAbbr;

        // Find matching game ±1 day
        const dt = new Date(gameDate);
        const prev = new Date(dt); prev.setDate(prev.getDate() - 1);
        const next = new Date(dt); next.setDate(next.getDate() + 1);
        const dateStart = prev.toISOString().split("T")[0] + "T00:00:00Z";
        const dateEnd = next.toISOString().split("T")[0] + "T23:59:59Z";

        // Try both home/away orderings since the ±1 day window may cross date boundaries
        let matchingGames: { id: string }[] | null = null;
        
        // Primary lookup
        const { data: primary } = await sb
          .from("games")
          .select("id")
          .eq("league", "NBA")
          .eq("home_abbr", homeAbbr)
          .eq("away_abbr", awayAbbr)
          .gte("start_time", dateStart)
          .lte("start_time", dateEnd)
          .limit(1);

        matchingGames = primary;

        // If not found, try swapped (in case home/away detection was wrong)
        if (!matchingGames || matchingGames.length === 0) {
          const { data: swapped } = await sb
            .from("games")
            .select("id")
            .eq("league", "NBA")
            .eq("home_abbr", awayAbbr)
            .eq("away_abbr", homeAbbr)
            .gte("start_time", dateStart)
            .lte("start_time", dateEnd)
            .limit(1);
          matchingGames = swapped;
        }

        // Fallback: search by either team appearing in any position
        if (!matchingGames || matchingGames.length === 0) {
          const { data: fallback } = await sb
            .from("games")
            .select("id")
            .eq("league", "NBA")
            .or(`and(home_abbr.eq.${rowTeam},away_abbr.eq.${oppAbbr}),and(home_abbr.eq.${oppAbbr},away_abbr.eq.${rowTeam})`)
            .gte("start_time", dateStart)
            .lte("start_time", dateEnd)
            .limit(1);
          matchingGames = fallback;
          if (matchingGames && matchingGames.length > 0) {
            console.log(`[import-player-gamelog-html] Fallback match found for ${gameDate}: ${rowTeam} vs ${oppAbbr}`);
          }
        }

        if (!matchingGames || matchingGames.length === 0) {
          console.log(`[import-player-gamelog-html] No game found: date=${gameDate} rowTeam=${rowTeam} opp=${oppAbbr} home=${homeAbbr} away=${awayAbbr} isAway=${isAway} range=${dateStart}..${dateEnd}`);
          totalGamesNotFound++;
          skipped++;
          continue;
        }

        const gameId = matchingGames[0].id;

        const stat = {
          game_id: gameId,
          player_id: playerId,
          team_abbr: rowTeam,
          league: "NBA",
          period: "full",
          starter: row.is_starter === "1" || row.is_starter === "*",
          minutes: num(row.mp),
          fg_made: num(row.fg),
          fg_attempted: num(row.fga),
          three_made: num(row.fg3),
          three_attempted: num(row.fg3a),
          ft_made: num(row.ft),
          ft_attempted: num(row.fta),
          off_rebounds: num(row.orb),
          def_rebounds: num(row.drb),
          rebounds: num(row.trb),
          assists: num(row.ast),
          steals: num(row.stl),
          blocks: num(row.blk),
          turnovers: num(row.tov),
          fouls: num(row.pf),
          points: num(row.pts),
          plus_minus: num(row.plus_minus),
        };

        const { error } = await sb
          .from("player_game_stats")
          .upsert(stat, { onConflict: "game_id,player_id,period" });

        if (error) {
          allErrors.push(`${player_name} ${gameDate}: ${error.message}`);
          skipped++;
        } else {
          inserted++;
        }
      }

      totalInserted += inserted;
      totalSkipped += skipped;
      playerResults.push({ player: player_name, inserted, skipped });
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_inserted: totalInserted,
        total_skipped: totalSkipped,
        players_created: totalPlayersCreated,
        games_not_found: totalGamesNotFound,
        player_results: playerResults,
        errors: allErrors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-player-gamelog-html error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────

function parsePlayerGameLog(html: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  // Try <tr data-row="N"> first, fall back to any <tr> containing data-stat cells
  let trRegex = /<tr\s+data-row="\d+"[^>]*>([\s\S]*?)<\/tr>/g;
  let hasDataRows = trRegex.test(html);
  trRegex.lastIndex = 0; // reset after test

  if (!hasDataRows) {
    // Fallback: match any <tr> that isn't in <thead>
    // Remove thead first to avoid matching header rows
    const noThead = html.replace(/<thead[\s\S]*?<\/thead>/gi, "");
    trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(noThead)) !== null) {
      const row = extractCells(trMatch[1]);
      if (row.date) rows.push(row);
    }
    return rows;
  }

  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = extractCells(trMatch[1]);
    if (row.date) rows.push(row);
  }

  return rows;
}

function extractCells(trContent: string): Record<string, string> {
  const row: Record<string, string> = {};
  const cellRegex = /<(?:th|td)\s[^>]*?data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:th|td)>/g;
  let cellMatch;
  while ((cellMatch = cellRegex.exec(trContent)) !== null) {
    const rawValue = cellMatch[2].replace(/<[^>]*>/g, "").trim();
    row[cellMatch[1]] = rawValue;
  }
  // Fallback: if no data-stat attributes, try positional mapping from plain <td>/<th>
  if (Object.keys(row).length === 0) {
    const plainRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g;
    const POSITIONAL_KEYS = [
      "date", "team_name_abbr", "game_location", "opp_name_abbr", "game_result",
      "is_starter", "mp", "fg", "fga", "fg_pct", "fg3", "fg3a", "fg3_pct",
      "ft", "fta", "ft_pct", "orb", "drb", "trb", "ast", "stl", "blk",
      "tov", "pf", "pts", "game_score", "plus_minus",
    ];
    let idx = 0;
    let pm;
    while ((pm = plainRegex.exec(trContent)) !== null && idx < POSITIONAL_KEYS.length) {
      row[POSITIONAL_KEYS[idx]] = pm[1].replace(/<[^>]*>/g, "").trim();
      idx++;
    }
  }
  return row;
}

function num(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const n = Number(v.replace(/[+,]/g, ""));
  return isNaN(n) ? null : n;
}
