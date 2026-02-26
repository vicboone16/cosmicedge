import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

/**
 * normalize-boxscores
 *
 * Finds finalized NBA games missing player_game_stats,
 * looks up API-Basketball game IDs, fetches player boxscores,
 * and upserts into player_game_stats.
 *
 * Supports backfilling via `date_from` / `date_to` params.
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

function reverseName(n: string): string {
  const parts = n.split(" ");
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  if (parts.length >= 3) return `${parts.slice(1).join(" ")} ${parts[0]}`;
  return n;
}

function firstInitialLast(n: string): string {
  // "K. Sanders" → match against names starting with K and ending with Sanders
  const parts = n.replace(/\./g, "").trim().split(/\s+/);
  if (parts.length >= 2 && parts[0].length <= 2) {
    return parts[0].charAt(0).toLowerCase() + ":" + parts.slice(1).join(" ").toLowerCase();
  }
  return "";
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
    const dateFrom = body.date_from || body.date || yesterday.toISOString().slice(0, 10);
    const dateTo = body.date_to || body.date || now.toISOString().slice(0, 10);
    const limit = parseInt(body.limit || "20");
    const force = body.force === true || body.force === "true";

    console.log(`[normalize-boxscores] Date range: ${dateFrom} to ${dateTo}, limit=${limit}, force=${force}`);

    // 1. Find finalized NBA games missing player stats
    const { data: finalGames, error: gErr } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, home_team, away_team, start_time")
      .eq("league", "NBA")
      .eq("status", "final")
      .gte("start_time", `${dateFrom}T00:00:00Z`)
      .lte("start_time", `${dateTo}T23:59:59Z`)
      .order("start_time", { ascending: false })
      .limit(limit);

    if (gErr) throw new Error(`Games query: ${gErr.message}`);
    if (!finalGames?.length) {
      console.log("[normalize-boxscores] No finalized games in range");
      return respond({ ok: true, processed: 0 });
    }

    let toProcess = finalGames;

    if (!force) {
      // Check which already have stats — skip those
      const gameIds = finalGames.map(g => g.id);
      const { data: existing } = await supabase
        .from("player_game_stats")
        .select("game_id")
        .in("game_id", gameIds);

      const hasStats = new Set((existing || []).map(s => s.game_id));
      toProcess = finalGames.filter(g => !hasStats.has(g.id));
    }

    if (!toProcess.length) {
      console.log(`[normalize-boxscores] All ${finalGames.length} games already have stats`);
      return respond({ ok: true, processed: 0, skipped: finalGames.length });
    }

    console.log(`[normalize-boxscores] ${toProcess.length} games need stats`);

    // 2. Pre-load players (columns are `name` and `team`)
    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, name, team")
      .eq("league", "NBA");

    const playersByTeamName: Record<string, any> = {};
    const playersByName: Record<string, any> = {};
    const playersByReverseName: Record<string, any> = {};
    const playersByInitialLast: Record<string, any[]> = {}; // "k:sanders" → [players]
    for (const p of allPlayers || []) {
      const key = normName(p.name);
      playersByName[key] = p;
      playersByTeamName[`${p.team}:${key}`] = p;
      // Also index reversed: "Kawhi Leonard" → "leonard kawhi"
      const rev = normName(reverseName(p.name));
      playersByReverseName[rev] = p;
      playersByTeamName[`${p.team}:${rev}`] = p;
      // Index by first initial + last name
      const parts = key.split(" ");
      if (parts.length >= 2) {
        const initialKey = parts[0].charAt(0) + ":" + parts.slice(1).join(" ");
        if (!playersByInitialLast[initialKey]) playersByInitialLast[initialKey] = [];
        playersByInitialLast[initialKey].push(p);
      }
    }

    console.log(`[normalize-boxscores] Loaded ${allPlayers?.length ?? 0} NBA players`);

    // Determine API-Basketball season string
    const seasonYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${seasonYear}-${seasonYear + 1}`;

    let processedCount = 0;
    let statsInserted = 0;
    let unmatchedPlayers = 0;

    // 3. Process each game — fetch API-Basketball games per date, then match
    const dateBuckets = new Map<string, typeof toProcess>();
    for (const g of toProcess) {
      const d = g.start_time.slice(0, 10);
      if (!dateBuckets.has(d)) dateBuckets.set(d, []);
      dateBuckets.get(d)!.push(g);
    }

    for (const [date, games] of dateBuckets) {
      let apiGames: any[] = [];
      try {
        const url = `/games?league=12&season=${season}&date=${date}`;
        console.log(`[normalize-boxscores] API: ${url}`);
        const json = await apiFetch(url, apiKey);
        apiGames = json.response || [];
        console.log(`[normalize-boxscores] ${apiGames.length} API games on ${date}`);
      } catch (err) {
        console.warn(`[normalize-boxscores] API fetch error for ${date}:`, err);
        continue;
      }

      for (const game of games) {
        // Match to API-Basketball game by team abbr
        const apiGame = apiGames.find(ag => {
          const homeName = ag.teams?.home?.name || "";
          const awayName = ag.teams?.away?.name || "";
          const homeAbbr = CANONICAL.NBA?.[homeName];
          const awayAbbr = CANONICAL.NBA?.[awayName];
          return homeAbbr === game.home_abbr && awayAbbr === game.away_abbr;
        });

        if (!apiGame) {
          console.log(`[normalize-boxscores] No API match: ${game.away_abbr} @ ${game.home_abbr} on ${date}`);
          continue;
        }

        const apiGameId = apiGame.id;
        console.log(`[normalize-boxscores] Fetching stats: ${game.away_abbr} @ ${game.home_abbr} (apiId: ${apiGameId})`);

        try {
          const statsJson = await apiFetch(`/games/statistics/players?id=${apiGameId}`, apiKey);
          const playerEntries = statsJson.response || [];

          if (!playerEntries.length) {
            console.log(`[normalize-boxscores] No player stats for apiId ${apiGameId}`);
            continue;
          }

          console.log(`[normalize-boxscores] Got ${playerEntries.length} player entries`);
          // Debug: log first entry's stat keys
          if (playerEntries.length > 0) {
            const first = playerEntries[0];
            const s0 = first.statistics?.[0] || first;
            console.log(`[normalize-boxscores] Stat keys: ${JSON.stringify(Object.keys(s0))}`);
            console.log(`[normalize-boxscores] Stat sample: ${JSON.stringify(s0).slice(0, 500)}`);
          }

          const rows: any[] = [];
          for (const entry of playerEntries) {
            const pName = entry.player?.name || "";
            const teamName = entry.team?.name || "";
            const resolvedAbbr = CANONICAL.NBA?.[teamName];
            // Determine team: resolved abbr must match home or away, else infer from API team id
            let teamAbbr: string;
            if (resolvedAbbr === game.home_abbr || resolvedAbbr === game.away_abbr) {
              teamAbbr = resolvedAbbr;
            } else if (entry.team?.id === apiGame.teams?.home?.id) {
              teamAbbr = game.home_abbr;
            } else if (entry.team?.id === apiGame.teams?.away?.id) {
              teamAbbr = game.away_abbr;
            } else {
              // Last resort: check if player is on a known team
              teamAbbr = resolvedAbbr || game.home_abbr;
            }

            const nameKey = normName(pName);
            // Try: team+name, name, team+reversed, reversed, initial matching
            let player = playersByTeamName[`${teamAbbr}:${nameKey}`]
              || playersByName[nameKey]
              || playersByReverseName[nameKey]
              || null;

            // Try initial-based match: "K. Sanders" → k:sanders
            if (!player) {
              const ik = firstInitialLast(pName);
              if (ik) {
                const candidates = playersByInitialLast[ik];
                if (candidates?.length === 1) {
                  player = candidates[0];
                } else if (candidates) {
                  // Prefer same team
                  player = candidates.find(c => c.team === teamAbbr) || null;
                }
              }
            }

            if (!player) {
              unmatchedPlayers++;
              if (unmatchedPlayers <= 10) {
                console.log(`[normalize-boxscores] Unmatched: "${pName}" → norm="${nameKey}" (${teamAbbr})`);
              }
              continue;
            }

            // Parse stat fields — API-Basketball v1 format:
            // field_goals: { total, attempts }, threepoint_goals: { total, attempts },
            // freethrows_goals: { total, attempts }, rebounds: { total },
            // assists: number, points: number, steals/blocks/turnovers/fouls may be present
            const s = entry.statistics?.[0] || entry;
            const v = (x: any): number => {
              if (x == null) return 0;
              if (typeof x === "number") return x;
              if (typeof x === "object" && x.total != null) return x.total;
              if (typeof x === "string") return parseInt(x) || 0;
              return 0;
            };
            const va = (x: any): number => {
              if (x == null) return 0;
              if (typeof x === "object" && x.attempts != null) return x.attempts;
              return v(x);
            };
            const minRaw = s.minutes || s.min || "0";
            const min = typeof minRaw === "string"
              ? Math.round(parseInt(minRaw.split(":")[0]) || 0)
              : (minRaw || 0);
            const pts = v(s.points);
            const reb = v(s.rebounds) || v(s.totReb) || v(s.totalRebounds);
            const ast = v(s.assists);
            const stl = v(s.steals);
            const blk = v(s.blocks);
            const tov = v(s.turnovers);
            // Field goals: try nested object first, then flat
            const fgm = v(s.field_goals) || v(s.fgm) || v(s.fieldGoalsMade);
            const fga = va(s.field_goals) || v(s.fga) || v(s.fieldGoalsAttempted);
            const tpm = v(s.threepoint_goals) || v(s.tpm) || v(s.threePointsMade);
            const tpa = va(s.threepoint_goals) || v(s.tpa) || v(s.threePointsAttempted);
            const ftm = v(s.freethrows_goals) || v(s.ftm) || v(s.freeThrowsMade);
            const fta = va(s.freethrows_goals) || v(s.fta) || v(s.freeThrowsAttempted);
            const oreb = v(s.offReb) || v(s.offensiveRebounds);
            const dreb = v(s.defReb) || v(s.defensiveRebounds);
            const pf = v(s.pFouls) || v(s.personalFouls) || v(s.fouls);
            const pm = s.plusMinus != null ? v(s.plusMinus) : null;

            // Skip DNP
            if (min === 0 && pts === 0 && reb === 0 && ast === 0) continue;

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

        // Rate limit: API-Sports allows 10 req/min
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    const result = {
      ok: true,
      processed: processedCount,
      statsInserted,
      unmatchedPlayers,
      totalGames: finalGames.length,
    };
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
