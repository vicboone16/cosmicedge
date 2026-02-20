import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

/**
 * normalize-boxscores
 *
 * Finds recently finalized NBA games missing player_game_stats,
 * looks up API-Basketball game IDs, fetches player boxscores,
 * and upserts into player_game_stats.
 */

const API_BASE = "https://v1.basketball.api-sports.io";

// Reverse CANONICAL: abbr → full name for matching
const ABBR_TO_NAME: Record<string, string> = {};
for (const [name, abbr] of Object.entries(CANONICAL.NBA || {})) {
  ABBR_TO_NAME[abbr] = name;
}

function normName(n: string): string {
  return (n || "").toLowerCase().replace(/[.']/g, "").replace(/\s+/g, " ").trim();
}

async function apiFetch(path: string, apiKey: string): Promise<any> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API-Basketball ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("API_BASKETBALL_KEY")!;
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(sbUrl, sbKey);

    let body: Record<string, string> = {};
    try { body = await req.json(); } catch { /* empty */ }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateFrom = body.date || yesterday.toISOString().slice(0, 10);
    const dateTo = body.date || now.toISOString().slice(0, 10);

    console.log(`[normalize-boxscores] Date range: ${dateFrom} to ${dateTo}`);

    // 1. Find finalized NBA games missing player stats
    const { data: finalGames, error: gErr } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, home_team, away_team, start_time")
      .eq("league", "NBA")
      .eq("status", "final")
      .gte("start_time", `${dateFrom}T00:00:00Z`)
      .lte("start_time", `${dateTo}T23:59:59Z`)
      .order("start_time", { ascending: false });

    if (gErr) throw new Error(`Games query: ${gErr.message}`);
    if (!finalGames?.length) {
      console.log("[normalize-boxscores] No finalized games");
      return respond({ ok: true, processed: 0 });
    }

    // Check which already have stats
    const gameIds = finalGames.map(g => g.id);
    const { data: existing } = await supabase
      .from("player_game_stats")
      .select("game_id")
      .in("game_id", gameIds);

    const hasStats = new Set((existing || []).map(s => s.game_id));
    const toProcess = finalGames.filter(g => !hasStats.has(g.id));

    if (!toProcess.length) {
      console.log(`[normalize-boxscores] All ${finalGames.length} games have stats`);
      return respond({ ok: true, processed: 0, skipped: finalGames.length });
    }

    console.log(`[normalize-boxscores] ${toProcess.length} games need stats`);

    // 2. Get API-Basketball games for the date range to find game IDs
    const seasonYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${seasonYear}-${seasonYear + 1}`;

    // Fetch by date(s) to find API-Basketball game IDs
    const apiGames: any[] = [];
    const dateSet = new Set([dateFrom, dateTo]);
    for (const d of dateSet) {
      try {
        const url = `/games?league=12&season=${season}&date=${d}`;
        console.log(`[normalize-boxscores] API call: ${url}`);
        const json = await apiFetch(url, apiKey);
        const games = json.response || [];
        apiGames.push(...games);
        console.log(`[normalize-boxscores] API-Basketball: ${games.length} games on ${d}, results: ${json.results}, errors: ${JSON.stringify(json.errors)}`);
        if (games.length > 0) {
          console.log(`[normalize-boxscores] Sample API game: ${JSON.stringify(games[0]).slice(0, 300)}`);
        }
      } catch (err) {
        console.warn(`[normalize-boxscores] API fetch error for ${d}:`, err);
      }
    }

    if (!apiGames.length) {
      console.log("[normalize-boxscores] No API-Basketball games found");
      return respond({ ok: true, processed: 0, apiGames: 0 });
    }

    // 3. Match our games to API-Basketball games by team name
    // Pre-load players
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, full_name, team_abbr")
      .eq("league", "NBA");

    const playersByTeamName: Record<string, any> = {};
    const playersByName: Record<string, any> = {};
    for (const p of allPlayers || []) {
      const key = normName(p.full_name);
      playersByName[key] = p;
      playersByTeamName[`${p.team_abbr}:${key}`] = p;
    }

    let processedCount = 0;
    let statsInserted = 0;

    for (const game of toProcess) {
      // Match to API-Basketball game
      const apiGame = apiGames.find(ag => {
        const homeName = ag.teams?.home?.name || "";
        const awayName = ag.teams?.away?.name || "";
        const homeAbbr = CANONICAL.NBA?.[homeName];
        const awayAbbr = CANONICAL.NBA?.[awayName];
        return homeAbbr === game.home_abbr && awayAbbr === game.away_abbr;
      });

      if (!apiGame) {
        console.log(`[normalize-boxscores] No API match: ${game.away_abbr} @ ${game.home_abbr}`);
        continue;
      }

      const apiGameId = apiGame.id;
      console.log(`[normalize-boxscores] Fetching player stats for ${game.away_abbr} @ ${game.home_abbr} (apiId: ${apiGameId})`);

      // 4. Fetch player statistics
      try {
        const statsJson = await apiFetch(`/games/statistics/players?id=${apiGameId}`, apiKey);
        const playerEntries = statsJson.response || [];

        if (!playerEntries.length) {
          console.log(`[normalize-boxscores] No player stats returned for apiId ${apiGameId}`);
          // Log full response for debugging
          console.log(`[normalize-boxscores] Response keys: ${JSON.stringify(Object.keys(statsJson))}, results: ${statsJson.results}`);
          continue;
        }

        console.log(`[normalize-boxscores] Got ${playerEntries.length} player entries for ${game.away_abbr} @ ${game.home_abbr}`);
        if (playerEntries.length > 0) {
          console.log(`[normalize-boxscores] Sample: ${JSON.stringify(playerEntries[0]).slice(0, 500)}`);
        }

        // 5. Normalize into player_game_stats rows
        const rows: any[] = [];
        for (const entry of playerEntries) {
          const pName = entry.player?.name || "";
          const teamName = entry.team?.name || "";
          const teamAbbr = CANONICAL.NBA?.[teamName] || game.home_abbr;

          const nameKey = normName(pName);
          const player = playersByTeamName[`${teamAbbr}:${nameKey}`] || playersByName[nameKey];

          if (!player) {
            console.log(`[normalize-boxscores] Unmatched: ${pName} (${teamAbbr})`);
            continue;
          }

          // Parse stat fields (API-Basketball format)
          const s = entry;
          const min = parseInt(s.minutes || s.min || "0") || 0;
          const pts = s.points ?? 0;
          const reb = s.totReb ?? s.rebounds ?? 0;
          const ast = s.assists ?? 0;
          const stl = s.steals ?? 0;
          const blk = s.blocks ?? 0;
          const tov = s.turnovers ?? 0;
          const fgm = s.fgm ?? 0;
          const fga = s.fga ?? 0;
          const tpm = s.tpm ?? 0;
          const tpa = s.tpa ?? 0;
          const ftm = s.ftm ?? 0;
          const fta = s.fta ?? 0;
          const oreb = s.offReb ?? 0;
          const dreb = s.defReb ?? 0;
          const pf = s.pFouls ?? s.fouls ?? 0;
          const pm = s.plusMinus ?? null;

          rows.push({
            game_id: game.id,
            player_id: player.id,
            team_abbr: teamAbbr,
            period: "full",
            league: "NBA",
            points: pts,
            rebounds: reb,
            assists: ast,
            steals: stl,
            blocks: blk,
            turnovers: tov,
            minutes: min,
            fg_made: fgm,
            fg_attempted: fga,
            three_made: tpm,
            three_attempted: tpa,
            ft_made: ftm,
            ft_attempted: fta,
            off_rebounds: oreb,
            def_rebounds: dreb,
            fouls: pf,
            plus_minus: pm,
          });
        }

        if (rows.length > 0) {
          const { error: upsertErr } = await supabase
            .from("player_game_stats")
            .upsert(rows, { onConflict: "game_id,player_id,period" });

          if (upsertErr) {
            console.error(`[normalize-boxscores] Upsert error: ${upsertErr.message}`);
          } else {
            statsInserted += rows.length;
            console.log(`[normalize-boxscores] ✓ ${rows.length} stats for ${game.away_abbr} @ ${game.home_abbr}`);
          }
        }

        processedCount++;
      } catch (err) {
        console.warn(`[normalize-boxscores] Stats error for ${apiGameId}:`, err);
      }

      // Rate limit: API-Sports allows 10 req/min on free tier
      await new Promise(r => setTimeout(r, 1500));
    }

    const result = { ok: true, processed: processedCount, statsInserted, totalGames: finalGames.length };
    console.log(`[normalize-boxscores] Done: ${JSON.stringify(result)}`);
    return respond(result);
  } catch (e: any) {
    console.error("[normalize-boxscores] Fatal:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function respond(data: any): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
