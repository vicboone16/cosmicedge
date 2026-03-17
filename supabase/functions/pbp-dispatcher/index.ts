/**
 * PBP Dispatcher — Single orchestrator for live NBA game data.
 *
 * Canonical provider: API-Basketball (api-sports.io basketball v1)
 * Runs every 1 minute via pg_cron.
 *
 * Flow:
 *  A) Fetch live games from API-Basketball
 *  B) Resolve / create game_key via resolveGameKey
 *  C) Upsert heartbeat into pbp_live_games_by_provider
 *  D) Extract per-quarter scores → upsert pbp_quarter_team_stats (pts)
 *  E) Fetch team stats → enrich pbp_quarter_team_stats (fgm/fga/fg3m/…)
 *  F) Update cosmic_games status
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveGameKey } from "../_shared/resolve-game-key.ts";
import { CANONICAL, normalizeAbbr } from "../_shared/team-mappings.ts";

const API_BASKETBALL_BASE = "https://v1.basketball.api-sports.io";

// Map API-Basketball status.short → our status
function mapStatus(short: string): string {
  switch (short) {
    case "Q1": case "Q2": case "Q3": case "Q4":
    case "OT": case "BT": case "HT":
      return "live";
    case "FT": case "AOT":
      return "final";
    case "NS":
      return "scheduled";
    case "POST": case "CANC": case "SUSP": case "AWD": case "ABD":
      return "postponed";
    default:
      return "scheduled";
  }
}

// Parse current period number from API-Basketball status
function parsePeriod(short: string): number | null {
  switch (short) {
    case "Q1": return 1;
    case "Q2": return 2;
    case "Q3": return 3;
    case "Q4": return 4;
    case "OT": return 5; // first OT; can't distinguish OT2+ from status alone
    case "HT": return 2; // halftime = end of Q2
    case "BT": return null; // break between quarters
    default: return null;
  }
}

// Resolve API-Basketball team name → canonical abbreviation
function resolveTeamAbbr(teamName: string, league: string): string | null {
  // Direct lookup in CANONICAL
  const dict = CANONICAL[league];
  if (!dict) return null;
  if (dict[teamName]) return dict[teamName];

  // Fuzzy: match last word (e.g. "Brooklyn Nets" → "Nets")
  const lastWord = teamName.split(" ").pop() || "";
  for (const [fullName, abbr] of Object.entries(dict)) {
    if (fullName.endsWith(lastWord)) return abbr;
  }

  // Try normalizeAbbr with common abbreviations
  try {
    return normalizeAbbr(league, teamName.slice(0, 3).toUpperCase());
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[pbp-dispatcher] ${msg}`); };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const writeMode = Deno.env.get("WRITE_MODE") || "safe_write";
    const apiKey = Deno.env.get("API_BASKETBALL_KEY");
    const killSwitch = Deno.env.get("PROVIDER_KILL_SWITCH") || "";

    if (!apiKey) {
      addLog("ERROR: API_BASKETBALL_KEY not configured");
      return new Response(
        JSON.stringify({ error: "API_BASKETBALL_KEY not configured", log }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (killSwitch.includes("api-basketball")) {
      addLog("api-basketball killed via PROVIDER_KILL_SWITCH — skipping");
      return new Response(
        JSON.stringify({ success: true, dispatched: false, reason: "kill_switch", log }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── A) Fetch live games from API-Basketball ──────────────────────────
    const now = new Date();
    const seasonYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${seasonYear}-${seasonYear + 1}`;

    const liveResp = await fetch(
      `${API_BASKETBALL_BASE}/games?league=12&season=${season}&live=all`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!liveResp.ok) {
      const body = await liveResp.text();
      addLog(`API-Basketball returned ${liveResp.status}: ${body.slice(0, 200)}`);
      throw new Error(`API-Basketball live error: ${liveResp.status}`);
    }

    const liveJson = await liveResp.json();
    const liveGames = liveJson.response || [];
    addLog(`Live games from API-Basketball: ${liveGames.length}`);

    if (liveGames.length === 0) {
      // Also check for games today that may have just finished
      const todayStr = now.toISOString().slice(0, 10);
      const todayResp = await fetch(
        `${API_BASKETBALL_BASE}/games?league=12&season=${season}&date=${todayStr}`,
        { headers: { "x-apisports-key": apiKey } }
      );
      const todayJson = todayResp.ok ? await todayResp.json() : { response: [] };
      const recentFinished = (todayJson.response || []).filter(
        (g: any) => g.status?.short === "FT" || g.status?.short === "AOT"
      );
      addLog(`No live games. Today's finished: ${recentFinished.length}`);

      // Process recently finished games to update status
      for (const fg of recentFinished) {
        await processGame(supabase, fg, writeMode, addLog);
      }

      return new Response(
        JSON.stringify({
          success: true,
          dispatched: false,
          live_count: 0,
          finished_today: recentFinished.length,
          write_mode: writeMode,
          log,
          latency_ms: Date.now() - t0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Process each live game ──────────────────────────────────────────
    const results: any[] = [];
    for (const game of liveGames) {
      const result = await processGame(supabase, game, writeMode, addLog);
      results.push(result);
    }

    // ── E) Fetch team stats for live games ──────────────────────────────
    const mappedGameIds = results
      .filter((r) => r.api_game_id && r.game_key)
      .map((r) => r.api_game_id);

    if (mappedGameIds.length > 0 && writeMode !== "dry_run") {
      await fetchAndWriteTeamStats(supabase, apiKey, mappedGameIds, results, addLog);
    }

    // ── F) Compute live readiness for all processed games ──────────────
    const readinessResults: Record<string, any> = {};
    const processedGameKeys = results.filter(r => r.game_key).map(r => r.game_key);
    for (const gk of new Set(processedGameKeys)) {
      try {
        const { data } = await supabase.rpc("compute_live_readiness", { p_game_id: gk });
        readinessResults[gk] = data;
      } catch (e) {
        addLog(`readiness compute failed for ${gk}: ${e.message}`);
      }
    }
    addLog(`Readiness computed for ${Object.keys(readinessResults).length} games`);

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: true,
        live_count: liveGames.length,
        write_mode: writeMode,
        results,
        readiness: readinessResults,
        log,
        latency_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    addLog(`FATAL: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg, log, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Process a single game ─────────────────────────────────────────────────
async function processGame(
  supabase: ReturnType<typeof createClient>,
  game: any,
  writeMode: string,
  addLog: (msg: string) => void
): Promise<Record<string, any>> {
  const apiGameId = String(game.id);
  const homeName = game.teams?.home?.name || "";
  const awayName = game.teams?.away?.name || "";
  const statusShort = game.status?.short || "NS";
  const ourStatus = mapStatus(statusShort);
  const currentPeriod = parsePeriod(statusShort);
  const dateStr = game.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  const homeAbbr = resolveTeamAbbr(homeName, "NBA");
  const awayAbbr = resolveTeamAbbr(awayName, "NBA");

  if (!homeAbbr || !awayAbbr) {
    addLog(`Could not resolve teams: "${homeName}" / "${awayName}" → quarantine`);
    if (writeMode !== "dry_run") {
      await supabase.from("cosmic_unmatched_games").insert({
        provider: "api-basketball",
        provider_game_id: apiGameId,
        league: "nba",
        reason: `team_resolution_failed: home="${homeName}" away="${awayName}"`,
        payload: game,
        diagnostics: { homeName, awayName, homeAbbr, awayAbbr },
      });
    }
    return { api_game_id: apiGameId, error: "team_resolution_failed", homeName, awayName };
  }

  // ── B) Resolve / Create game_key ────────────────────────────────────
  const resolveResult = await resolveGameKey(supabase, {
    provider: "api-basketball",
    provider_game_id: apiGameId,
    league: "nba",
    game_date: dateStr,
    start_time_utc: game.date || undefined,
    home_team_abbr: homeAbbr,
    away_team_abbr: awayAbbr,
    payload: game,
  }, writeMode);

  if (!resolveResult.game_key) {
    addLog(`Game ${apiGameId} (${awayAbbr}@${homeAbbr}): unmatched (${resolveResult.match_method})`);
    return {
      api_game_id: apiGameId, home: homeAbbr, away: awayAbbr,
      error: "no_game_key", match_method: resolveResult.match_method,
    };
  }

  const gameKey = resolveResult.game_key;
  addLog(`Game ${apiGameId} → ${gameKey} (${awayAbbr}@${homeAbbr}) status=${statusShort} method=${resolveResult.match_method}`);

  if (writeMode === "dry_run") {
    return {
      api_game_id: apiGameId, game_key: gameKey, home: homeAbbr, away: awayAbbr,
      status: ourStatus, period: currentPeriod, dry_run: true,
      scores: game.scores,
    };
  }

  // ── C) Heartbeat ────────────────────────────────────────────────────
  await supabase.from("pbp_live_games_by_provider").upsert({
    provider: "api-basketball",
    provider_game_id: apiGameId,
    league: "nba",
    game_key: gameKey,
    status: ourStatus,
    raw: { status: statusShort, period: currentPeriod, timer: game.status?.timer },
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,provider_game_id" });

  // ── D) Extract per-quarter scores → pbp_quarter_team_stats ──────────
  const homeScores = game.scores?.home || {};
  const awayScores = game.scores?.away || {};
  let quartersWritten = 0;

  // Map quarter keys to period numbers
  const quarterMap: Record<string, number> = {
    quarter_1: 1, quarter_2: 2, quarter_3: 3, quarter_4: 4,
    over_time: 5,
  };

  for (const [key, period] of Object.entries(quarterMap)) {
    const homePts = homeScores[key];
    const awayPts = awayScores[key];

    // Skip if both null/0 and game hasn't reached this period
    if (homePts == null && awayPts == null) continue;
    if (homePts === 0 && awayPts === 0 && currentPeriod !== null && period > currentPeriod) continue;

    // Upsert home team period stats (pts only from quarter scores)
    await supabase.from("pbp_quarter_team_stats").upsert({
      game_key: gameKey,
      provider: "api-basketball",
      period,
      team_abbr: homeAbbr,
      pts: homePts ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_key,provider,period,team_abbr" });

    // Upsert away team period stats
    await supabase.from("pbp_quarter_team_stats").upsert({
      game_key: gameKey,
      provider: "api-basketball",
      period,
      team_abbr: awayAbbr,
      pts: awayPts ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_key,provider,period,team_abbr" });

    quartersWritten++;
  }

  // ── F) Update cosmic_games status ───────────────────────────────────
  await supabase.from("cosmic_games").update({
    status: ourStatus,
    updated_at: new Date().toISOString(),
  }).eq("game_key", gameKey);

  return {
    api_game_id: apiGameId, game_key: gameKey, home: homeAbbr, away: awayAbbr,
    status: ourStatus, period: currentPeriod, quarters_written: quartersWritten,
    match_method: resolveResult.match_method, created_new: resolveResult.created_new,
  };
}

// ── Fetch team stats from API-Basketball and enrich pbp_quarter_team_stats ──
async function fetchAndWriteTeamStats(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  apiGameIds: string[],
  results: any[],
  addLog: (msg: string) => void
) {
  // API-Basketball supports batching up to 20 ids with "ids" param
  const idsParam = apiGameIds.slice(0, 20).join("-");

  try {
    const resp = await fetch(
      `${API_BASKETBALL_BASE}/games/statistics/teams?ids=${idsParam}`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!resp.ok) {
      addLog(`Team stats API returned ${resp.status}`);
      return;
    }

    const json = await resp.json();
    const stats = json.response || [];
    addLog(`Team stats received: ${stats.length} entries`);

    // Group stats by game_id
    const byGame: Record<string, any[]> = {};
    for (const s of stats) {
      const gid = String(s.game?.id);
      if (!byGame[gid]) byGame[gid] = [];
      byGame[gid].push(s);
    }

    // For each game, find the result to get game_key and team abbrs
    for (const result of results) {
      if (!result.game_key || !result.api_game_id) continue;
      const teamStats = byGame[result.api_game_id];
      if (!teamStats) continue;

      // Team stats from API-Basketball are full-game totals, not per-period.
      // We'll store them as period=0 (full game) for reference.
      for (const ts of teamStats) {
        // Determine which team this is (home or away)
        // Look up team name from our results
        const teamId = ts.team?.id;
        // We need to figure out if this is home or away
        // For now, store with a team_abbr derived from position in results
        const teamAbbr = teamStats.indexOf(ts) === 0 ? result.home : result.away;

        await supabase.from("pbp_quarter_team_stats").upsert({
          game_key: result.game_key,
          provider: "api-basketball",
          period: 0, // 0 = full game
          team_abbr: teamAbbr,
          pts: 0, // total pts already tracked per quarter
          fgm: ts.field_goals?.total ?? 0,
          fga: ts.field_goals?.attempts ?? 0,
          fg3m: ts.threepoint_goals?.total ?? 0,
          fg3a: ts.threepoint_goals?.attempts ?? 0,
          ftm: ts.freethrows_goals?.total ?? 0,
          fta: ts.freethrows_goals?.attempts ?? 0,
          oreb: ts.rebounds?.offence ?? 0,
          dreb: ts.rebounds?.defense ?? 0,
          tov: ts.turnovers ?? 0,
          fouls: ts.personal_fouls ?? 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "game_key,provider,period,team_abbr" });
      }
    }
  } catch (e) {
    addLog(`Team stats fetch error: ${e.message}`);
  }
}
