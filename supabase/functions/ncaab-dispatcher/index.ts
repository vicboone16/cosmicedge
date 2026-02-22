/**
 * NCAAB Dispatcher — Orchestrator for live NCAA Basketball data.
 *
 * Canonical provider: API-Basketball (api-sports.io basketball v1)
 * NCAA league ID: 116 (NCAA)
 * Runs every 2 minutes via pg_cron.
 *
 * Flow:
 *  A) Fetch live + today's games from API-Basketball (league=116)
 *  B) Resolve team abbreviations dynamically (no static mapping for 350+ teams)
 *  C) Resolve / create game_key via resolveGameKey
 *  D) Upsert heartbeat into pbp_live_games_by_provider
 *  E) Extract per-half/period scores → upsert pbp_quarter_team_stats
 *  F) Fetch team stats → enrich pbp_quarter_team_stats
 *  G) Update cosmic_games status
 *
 * Also supports mode=sync_schedule to bulk-import today/tomorrow schedule.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveGameKey } from "../_shared/resolve-game-key.ts";

const API_BASKETBALL_BASE = "https://v1.basketball.api-sports.io";
const NCAAB_LEAGUE_ID = 116; // NCAA in API-Basketball

// Map API-Basketball status.short → our status
function mapStatus(short: string): string {
  switch (short) {
    case "Q1": case "Q2": case "Q3": case "Q4":
    case "OT": case "BT": case "HT":
      return "live";
    // NCAA uses halves: H1, H2
    case "H1": case "H2":
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
// NCAA basketball uses halves (H1, H2) but may also report quarters
function parsePeriod(short: string): number | null {
  switch (short) {
    case "Q1": return 1;
    case "Q2": case "H1": return 2; // end of first half
    case "Q3": return 3;
    case "Q4": case "H2": return 4; // end of second half  
    case "OT": return 5;
    case "HT": return 2;
    case "BT": return null;
    default: return null;
  }
}

/**
 * Dynamic team abbreviation generator for NCAA teams.
 * Since there are 350+ D1 teams, we generate deterministic abbreviations
 * from team names rather than maintaining a static map.
 * 
 * Strategy:
 *  - Use API-Basketball team ID as a stable identifier prefix
 *  - Generate a readable abbreviation from the team name
 */
function generateTeamAbbr(teamName: string, teamId: number | string): string {
  if (!teamName) return `T${teamId}`;
  
  // Remove common suffixes
  const cleaned = teamName
    .replace(/\s+(Wildcats|Bears|Tigers|Eagles|Bulldogs|Panthers|Lions|Hawks|Mustangs|Cougars|Knights|Wolves|Cardinals)$/i, "")
    .trim();
  
  // Split into words
  const words = cleaned.split(/\s+/);
  
  if (words.length === 1) {
    // Single word: take first 4 chars uppercase
    return words[0].slice(0, 4).toUpperCase();
  }
  
  if (words.length === 2) {
    // Two words: first letter of each + first extra char of last word
    return (words[0][0] + words[1].slice(0, 2)).toUpperCase();
  }
  
  // 3+ words: first letter of each word
  return words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
}

/**
 * Build a stable team abbreviation using a cache table.
 * First check if we've seen this API-Basketball team before.
 * If not, generate and store the abbreviation.
 */
async function resolveNcaabTeamAbbr(
  supabase: ReturnType<typeof createClient>,
  teamName: string,
  teamId: number | string,
  writeMode: string
): Promise<string> {
  // Check if we already have a mapping for this API-Basketball team ID
  const cacheKey = `ncaab_team_${teamId}`;
  const { data: cached } = await supabase
    .from("api_cache")
    .select("payload")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.payload?.abbr) {
    return cached.payload.abbr as string;
  }

  // Generate abbreviation
  const abbr = generateTeamAbbr(teamName, teamId);

  // Cache it (using api_cache table for simplicity)
  if (writeMode !== "dry_run") {
    await supabase.from("api_cache").upsert({
      cache_key: cacheKey,
      payload: { abbr, team_name: teamName, api_team_id: teamId },
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  }

  return abbr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[ncaab-dispatcher] ${msg}`); };

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

    if (killSwitch.includes("ncaab") || killSwitch.includes("api-basketball")) {
      addLog("NCAAB killed via PROVIDER_KILL_SWITCH — skipping");
      return new Response(
        JSON.stringify({ success: true, dispatched: false, reason: "kill_switch", log }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body for mode
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const mode = (body.mode as string) || "live";

    // ── Determine season ─────────────────────────────────────────────────
    const now = new Date();
    // NCAA basketball season: Nov-Apr, use academic year format
    const seasonYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${seasonYear}-${seasonYear + 1}`;

    // ── MODE: sync_schedule ──────────────────────────────────────────────
    if (mode === "sync_schedule") {
      return await syncSchedule(supabase, apiKey, season, writeMode, addLog, t0);
    }

    // ── MODE: sync_teams ─────────────────────────────────────────────────
    if (mode === "sync_teams") {
      return await syncTeams(supabase, apiKey, season, writeMode, addLog, t0);
    }

    // ── MODE: sync_standings ─────────────────────────────────────────────
    if (mode === "sync_standings") {
      return await syncStandings(supabase, apiKey, season, writeMode, addLog, t0);
    }

    // ── MODE: backfill — fetch all past games for the season ─────────────
    if (mode === "backfill") {
      const startDate = (body.start_date as string) || `${seasonYear}-11-01`;
      const endDate = (body.end_date as string) || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const fetchStats = body.fetch_stats !== false;
      const offset = Number(body.offset) || 0;
      const limit = Number(body.limit) || 15;
      return await backfillSeason(supabase, apiKey, season, startDate, endDate, fetchStats, offset, limit, writeMode, addLog, t0);
    }

    // ── MODE: backfill_auto — self-chaining backfill via api_cache cursor ─
    if (mode === "backfill_auto") {
      const CURSOR_KEY = "ncaab_backfill_cursor";
      const defaultStart = `${seasonYear}-11-04`;
      const defaultEnd = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Read cursor from api_cache
      const { data: cursor } = await supabase
        .from("api_cache").select("payload").eq("cache_key", CURSOR_KEY).maybeSingle();

      const cursorPayload = cursor?.payload as any;

      // Check if backfill is done
      if (cursorPayload?.status === "done") {
        addLog("Backfill already complete. Delete api_cache row 'ncaab_backfill_cursor' to restart.");
        return new Response(
          JSON.stringify({ success: true, mode: "backfill_auto", status: "done", log, latency_ms: Date.now() - t0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const startDate = cursorPayload?.next_start_date || defaultStart;
      const endDate = cursorPayload?.end_date || defaultEnd;
      const offset = cursorPayload?.next_offset || 0;
      const limit = 15;

      addLog(`backfill_auto: resuming from date=${startDate} offset=${offset} end=${endDate}`);

      // Run one batch of backfill
      const result = await backfillSeasonReturnData(supabase, apiKey, season, startDate, endDate, true, offset, limit, writeMode, addLog, t0);

      // Save cursor for next invocation
      if (result.next_call) {
        await supabase.from("api_cache").upsert({
          cache_key: CURSOR_KEY,
          payload: {
            next_start_date: result.next_call.start_date,
            end_date: result.next_call.end_date || endDate,
            next_offset: result.next_call.offset || 0,
            status: "in_progress",
            last_date_processed: startDate,
            last_run: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "cache_key" });
      } else {
        // Backfill complete
        await supabase.from("api_cache").upsert({
          cache_key: CURSOR_KEY,
          payload: {
            status: "done",
            completed_at: new Date().toISOString(),
            last_date_processed: startDate,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "cache_key" });
        addLog("🎉 Backfill complete!");
      }

      return new Response(
        JSON.stringify({
          success: true, mode: "backfill_auto",
          date: startDate, offset, processed: result.processed,
          created: result.created, next_call: result.next_call,
          status: result.next_call ? "in_progress" : "done",
          write_mode: writeMode, log, latency_ms: Date.now() - t0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── MODE: backfill_h2h — fetch head-to-head history ──────────────────
    if (mode === "backfill_h2h") {
      const teamId = body.team_id as string;
      if (!teamId) {
        return new Response(JSON.stringify({ error: "team_id required for backfill_h2h", log }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return await backfillH2H(supabase, apiKey, season, teamId, writeMode, addLog, t0);
    }

    // ── MODE: live (default) ─────────────────────────────────────────────
    // A) Fetch live games from API-Basketball NCAA
    const liveResp = await fetch(
      `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&live=all`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!liveResp.ok) {
      const respBody = await liveResp.text();
      addLog(`API-Basketball NCAAB returned ${liveResp.status}: ${respBody.slice(0, 200)}`);
      throw new Error(`API-Basketball NCAAB live error: ${liveResp.status}`);
    }

    const liveJson = await liveResp.json();
    const liveGames = liveJson.response || [];
    addLog(`Live NCAAB games: ${liveGames.length}`);

    if (liveGames.length === 0) {
      // Check today's finished games
      const todayStr = now.toISOString().slice(0, 10);
      const todayResp = await fetch(
        `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&date=${todayStr}`,
        { headers: { "x-apisports-key": apiKey } }
      );
      const todayJson = todayResp.ok ? await todayResp.json() : { response: [] };
      const recentFinished = (todayJson.response || []).filter(
        (g: any) => g.status?.short === "FT" || g.status?.short === "AOT"
      );
      addLog(`No live NCAAB games. Today's finished: ${recentFinished.length}`);

      for (const fg of recentFinished) {
        await processGame(supabase, fg, writeMode, addLog);
      }

      return new Response(
        JSON.stringify({
          success: true, dispatched: false, live_count: 0,
          finished_today: recentFinished.length,
          write_mode: writeMode, log, latency_ms: Date.now() - t0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Process each live game ───────────────────────────────────────────
    const results: any[] = [];
    for (const game of liveGames) {
      const result = await processGame(supabase, game, writeMode, addLog);
      results.push(result);
    }

    // ── Fetch team stats for live games ──────────────────────────────────
    const mappedGameIds = results
      .filter((r) => r.api_game_id && r.game_key)
      .map((r) => r.api_game_id);

    if (mappedGameIds.length > 0 && writeMode !== "dry_run") {
      await fetchAndWriteTeamStats(supabase, apiKey, mappedGameIds, results, addLog);
    }

    return new Response(
      JSON.stringify({
        success: true, dispatched: true, live_count: liveGames.length,
        write_mode: writeMode, results, log, latency_ms: Date.now() - t0,
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

// ── Process a single NCAAB game ───────────────────────────────────────────
async function processGame(
  supabase: ReturnType<typeof createClient>,
  game: any,
  writeMode: string,
  addLog: (msg: string) => void
): Promise<Record<string, any>> {
  const apiGameId = String(game.id);
  const homeName = game.teams?.home?.name || "";
  const awayName = game.teams?.away?.name || "";
  const homeTeamId = game.teams?.home?.id || 0;
  const awayTeamId = game.teams?.away?.id || 0;
  const statusShort = game.status?.short || "NS";
  const ourStatus = mapStatus(statusShort);
  const currentPeriod = parsePeriod(statusShort);
  const dateStr = game.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);

  // Dynamic team abbreviation resolution for NCAA
  const homeAbbr = await resolveNcaabTeamAbbr(supabase, homeName, homeTeamId, writeMode);
  const awayAbbr = await resolveNcaabTeamAbbr(supabase, awayName, awayTeamId, writeMode);

  if (!homeAbbr || !awayAbbr) {
    addLog(`Could not resolve NCAAB teams: "${homeName}" / "${awayName}" → quarantine`);
    if (writeMode !== "dry_run") {
      await supabase.from("cosmic_unmatched_games").insert({
        provider: "api-basketball",
        provider_game_id: apiGameId,
        league: "NCAAB",
        reason: `team_resolution_failed: home="${homeName}" away="${awayName}"`,
        payload: game,
        diagnostics: { homeName, awayName, homeTeamId, awayTeamId },
      });
    }
    return { api_game_id: apiGameId, error: "team_resolution_failed", homeName, awayName };
  }

  // ── B) Resolve / Create game_key ────────────────────────────────────
  const resolveResult = await resolveGameKey(supabase, {
    provider: "api-basketball",
    provider_game_id: apiGameId,
    league: "NCAAB",
    game_date: dateStr,
    start_time_utc: game.date || undefined,
    home_team_abbr: homeAbbr,
    away_team_abbr: awayAbbr,
    payload: game,
  }, writeMode);

  if (!resolveResult.game_key) {
    addLog(`NCAAB ${apiGameId} (${awayAbbr}@${homeAbbr}): unmatched (${resolveResult.match_method})`);
    return {
      api_game_id: apiGameId, home: homeAbbr, away: awayAbbr,
      error: "no_game_key", match_method: resolveResult.match_method,
    };
  }

  const gameKey = resolveResult.game_key;
  addLog(`NCAAB ${apiGameId} → ${gameKey} (${awayAbbr}@${homeAbbr}) status=${statusShort} method=${resolveResult.match_method}`);

  if (writeMode === "dry_run") {
    return {
      api_game_id: apiGameId, game_key: gameKey, home: homeAbbr, away: awayAbbr,
      status: ourStatus, period: currentPeriod, dry_run: true, scores: game.scores,
    };
  }

  // ── C) Heartbeat ────────────────────────────────────────────────────
  await supabase.from("pbp_live_games_by_provider").upsert({
    provider: "api-basketball",
    provider_game_id: apiGameId,
    league: "NCAAB",
    game_key: gameKey,
    status: ourStatus,
    raw: { status: statusShort, period: currentPeriod, timer: game.status?.timer },
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,provider_game_id" });

  // ── D) Extract per-period scores → pbp_quarter_team_stats ───────────
  const homeScores = game.scores?.home || {};
  const awayScores = game.scores?.away || {};
  let periodsWritten = 0;

  // NCAA uses halves but API may report as quarters or halves
  const periodMap: Record<string, number> = {
    quarter_1: 1, quarter_2: 2, quarter_3: 3, quarter_4: 4,
    over_time: 5,
    // Some NCAA games report halves
    half_1: 1, half_2: 2,
  };

  for (const [key, period] of Object.entries(periodMap)) {
    const homePts = homeScores[key];
    const awayPts = awayScores[key];

    if (homePts == null && awayPts == null) continue;
    if (homePts === 0 && awayPts === 0 && currentPeriod !== null && period > currentPeriod) continue;

    await supabase.from("pbp_quarter_team_stats").upsert({
      game_key: gameKey, provider: "api-basketball", period,
      team_abbr: homeAbbr, pts: homePts ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_key,provider,period,team_abbr" });

    await supabase.from("pbp_quarter_team_stats").upsert({
      game_key: gameKey, provider: "api-basketball", period,
      team_abbr: awayAbbr, pts: awayPts ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_key,provider,period,team_abbr" });

    periodsWritten++;
  }

  // ── G) Update cosmic_games status ───────────────────────────────────
  await supabase.from("cosmic_games").update({
    status: ourStatus,
    updated_at: new Date().toISOString(),
  }).eq("game_key", gameKey);

  // ── H) Sync to games table so homepage/UI can find NCAAB games ─────
  const homeTotal = game.scores?.home?.total ?? null;
  const awayTotal = game.scores?.away?.total ?? null;
  const startTimeUtc = game.date || `${dateStr}T00:00:00Z`;

  await supabase.from("games").upsert({
    external_id: `api-basketball-ncaab-${apiGameId}`,
    league: "NCAAB",
    home_team: homeName,
    away_team: awayName,
    home_abbr: homeAbbr,
    away_abbr: awayAbbr,
    start_time: startTimeUtc,
    status: ourStatus,
    home_score: homeTotal,
    away_score: awayTotal,
    venue: game.arena?.name || null,
    source: "api-basketball",
    updated_at: new Date().toISOString(),
  }, { onConflict: "external_id" });

  return {
    api_game_id: apiGameId, game_key: gameKey, home: homeAbbr, away: awayAbbr,
    status: ourStatus, period: currentPeriod, periods_written: periodsWritten,
    match_method: resolveResult.match_method, created_new: resolveResult.created_new,
  };
}

// ── Fetch team stats from API-Basketball ──────────────────────────────────
async function fetchAndWriteTeamStats(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  apiGameIds: string[],
  results: any[],
  addLog: (msg: string) => void
) {
  const idsParam = apiGameIds.slice(0, 20).join("-");

  try {
    const resp = await fetch(
      `${API_BASKETBALL_BASE}/games/statistics/teams?ids=${idsParam}`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!resp.ok) {
      addLog(`NCAAB team stats API returned ${resp.status}`);
      return;
    }

    const json = await resp.json();
    const stats = json.response || [];
    addLog(`NCAAB team stats received: ${stats.length} entries`);

    const byGame: Record<string, any[]> = {};
    for (const s of stats) {
      const gid = String(s.game?.id);
      if (!byGame[gid]) byGame[gid] = [];
      byGame[gid].push(s);
    }

    for (const result of results) {
      if (!result.game_key || !result.api_game_id) continue;
      const teamStats = byGame[result.api_game_id];
      if (!teamStats) continue;

      for (const ts of teamStats) {
        const teamAbbr = teamStats.indexOf(ts) === 0 ? result.home : result.away;

        await supabase.from("pbp_quarter_team_stats").upsert({
          game_key: result.game_key, provider: "api-basketball",
          period: 0, team_abbr: teamAbbr,
          pts: 0,
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
  } catch (e: any) {
    addLog(`NCAAB team stats fetch error: ${e.message}`);
  }
}

// ── MODE: sync_schedule — bulk import today/tomorrow games ────────────────
async function syncSchedule(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  const now = new Date();
  const dates = [
    now.toISOString().slice(0, 10),
    new Date(now.getTime() + 86400000).toISOString().slice(0, 10),
  ];

  let totalGames = 0;
  let created = 0;

  for (const dateStr of dates) {
    const resp = await fetch(
      `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&date=${dateStr}`,
      { headers: { "x-apisports-key": apiKey } }
    );

    if (!resp.ok) {
      addLog(`Schedule fetch for ${dateStr} failed: ${resp.status}`);
      continue;
    }

    const json = await resp.json();
    const games = json.response || [];
    totalGames += games.length;
    addLog(`Schedule ${dateStr}: ${games.length} NCAAB games`);

    for (const game of games) {
      const result = await processGame(supabase, game, writeMode, addLog);
      if (result.created_new) created++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true, mode: "sync_schedule", total_games: totalGames,
      created, write_mode: writeMode, log, latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── MODE: sync_teams — fetch and cache all NCAAB teams ────────────────────
async function syncTeams(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  const resp = await fetch(
    `${API_BASKETBALL_BASE}/teams?league=${NCAAB_LEAGUE_ID}&season=${season}`,
    { headers: { "x-apisports-key": apiKey } }
  );

  if (!resp.ok) {
    addLog(`Teams fetch failed: ${resp.status}`);
    return new Response(
      JSON.stringify({ error: `Teams fetch failed: ${resp.status}`, log }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const json = await resp.json();
  const teams = json.response || [];
  addLog(`NCAAB teams found: ${teams.length}`);

  let cached = 0;
  for (const team of teams) {
    const teamId = team.id;
    const teamName = team.name || "";
    const abbr = await resolveNcaabTeamAbbr(supabase, teamName, teamId, writeMode);
    cached++;
  }

  return new Response(
    JSON.stringify({
      success: true, mode: "sync_teams", teams_count: teams.length,
      cached, write_mode: writeMode, log, latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── MODE: sync_standings — fetch NCAAB standings ──────────────────────────
async function syncStandings(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  const resp = await fetch(
    `${API_BASKETBALL_BASE}/standings?league=${NCAAB_LEAGUE_ID}&season=${season}`,
    { headers: { "x-apisports-key": apiKey } }
  );

  if (!resp.ok) {
    addLog(`Standings fetch failed: ${resp.status}`);
    return new Response(
      JSON.stringify({ error: `Standings fetch failed: ${resp.status}`, log }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const json = await resp.json();
  const standings = json.response || [];
  addLog(`NCAAB standings groups: ${standings.length}`);

  // Standings come as arrays of groups (conferences)
  // Store raw in api_cache for now
  if (writeMode !== "dry_run") {
    await supabase.from("api_cache").upsert({
      cache_key: `ncaab_standings_${season}`,
      payload: { standings, fetched_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  }

  return new Response(
    JSON.stringify({
      success: true, mode: "sync_standings", groups: standings.length,
      write_mode: writeMode, log, latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── MODE: backfill — iterate past dates and fetch all finished games ──────
async function backfillSeason(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  startDate: string,
  endDate: string,
  fetchStats: boolean,
  offset: number,
  limit: number,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  const log: string[] = [];
  const logMsg = (msg: string) => { log.push(msg); addLog(msg); };
  const result = await backfillSeasonCore(supabase, apiKey, season, startDate, endDate, fetchStats, offset, limit, writeMode, logMsg, t0);

  return new Response(
    JSON.stringify({
      success: true, mode: "backfill", date: startDate,
      ...result,
      write_mode: writeMode, log, latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/** Returns structured data instead of a Response — used by backfill_auto */
async function backfillSeasonReturnData(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  startDate: string,
  endDate: string,
  fetchStats: boolean,
  offset: number,
  limit: number,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  return await backfillSeasonCore(supabase, apiKey, season, startDate, endDate, fetchStats, offset, limit, writeMode, addLog, t0);
}

/** Core backfill logic shared by both backfill and backfill_auto modes */
async function backfillSeasonCore(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  startDate: string,
  endDate: string,
  fetchStats: boolean,
  offset: number,
  limit: number,
  writeMode: string,
  logMsg: (msg: string) => void,
  t0: number
) {
  const dateStr = startDate;
  logMsg(`Backfill NCAAB date=${dateStr} offset=${offset} limit=${limit}`);

  const resp = await fetch(
    `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&date=${dateStr}`,
    { headers: { "x-apisports-key": apiKey } }
  );

  if (!resp.ok) {
    logMsg(`Backfill ${dateStr} failed: ${resp.status}`);
    return { error: `API error ${resp.status}`, processed: 0, created: 0, next_call: null };
  }

  const json = await resp.json();
  const allGames = json.response || [];
  const finishedGames = allGames.filter((g: any) => g.status?.short === "FT" || g.status?.short === "AOT");
  
  const batch = finishedGames.slice(offset, offset + limit);
  const moreOnThisDay = offset + limit < finishedGames.length;
  logMsg(`${dateStr}: ${finishedGames.length} finished, processing ${batch.length} (offset ${offset})`);

  if (batch.length === 0) {
    const nextDate = new Date(new Date(dateStr + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
    return {
      total: allGames.length, finished: finishedGames.length, processed: 0, created: 0,
      next_call: nextDate <= endDate ? { start_date: nextDate, end_date: endDate, offset: 0 } : null,
    };
  }

  if (writeMode === "dry_run") {
    return { dry_run: true, processed: batch.length, created: 0, next_call: null };
  }

  // Pre-load team abbreviations
  const teamIdSet = new Set<string>();
  for (const g of batch) {
    teamIdSet.add(String(g.teams?.home?.id || 0));
    teamIdSet.add(String(g.teams?.away?.id || 0));
  }
  const cacheKeys = [...teamIdSet].map(id => `ncaab_team_${id}`);
  const { data: cachedTeams } = await supabase
    .from("api_cache").select("cache_key, payload").in("cache_key", cacheKeys);

  const teamAbbrMap: Record<string, string> = {};
  for (const ct of cachedTeams || []) {
    teamAbbrMap[ct.cache_key] = (ct.payload as any)?.abbr || "";
  }

  const newTeamCache: any[] = [];
  for (const g of batch) {
    for (const side of ["home", "away"] as const) {
      const tid = String(g.teams?.[side]?.id || 0);
      const key = `ncaab_team_${tid}`;
      if (!teamAbbrMap[key]) {
        const name = g.teams?.[side]?.name || "";
        const abbr = generateTeamAbbr(name, tid);
        teamAbbrMap[key] = abbr;
        newTeamCache.push({ cache_key: key, payload: { abbr, team_name: name, api_team_id: tid }, updated_at: new Date().toISOString() });
      }
    }
  }
  if (newTeamCache.length > 0) {
    await supabase.from("api_cache").upsert(newTeamCache, { onConflict: "cache_key" });
  }

  // Pre-load existing maps
  const apiGameIds = batch.map((g: any) => String(g.id));
  const { data: existingMaps } = await supabase
    .from("cosmic_game_id_map")
    .select("provider_game_id, game_key")
    .eq("provider", "api-basketball")
    .in("provider_game_id", apiGameIds);

  const existingMapLookup: Record<string, string> = {};
  for (const m of existingMaps || []) {
    existingMapLookup[m.provider_game_id] = m.game_key;
  }

  // Process each game
  let created = 0;
  let skipped = 0;
  const allPeriodRows: any[] = [];
  const newIdMaps: any[] = [];

  const gamesTableRows: any[] = [];

  for (const game of batch) {
    const apiGameId = String(game.id);
    const homeId = String(game.teams?.home?.id || 0);
    const awayId = String(game.teams?.away?.id || 0);
    const homeAbbr = teamAbbrMap[`ncaab_team_${homeId}`] || `T${homeId}`;
    const awayAbbr = teamAbbrMap[`ncaab_team_${awayId}`] || `T${awayId}`;
    const gameDateStr = game.date?.slice(0, 10) || dateStr;
    const homeName = game.teams?.home?.name || "";
    const awayName = game.teams?.away?.name || "";

    let gameKey = existingMapLookup[apiGameId];

    if (!gameKey) {
      const { data: cg } = await supabase
        .from("cosmic_games").select("game_key")
        .eq("league", "NCAAB").eq("game_date", gameDateStr)
        .eq("home_team_abbr", homeAbbr).eq("away_team_abbr", awayAbbr)
        .maybeSingle();

      if (cg?.game_key) {
        gameKey = cg.game_key;
      } else {
        const { data: newCg } = await supabase
          .from("cosmic_games")
          .insert({ league: "NCAAB", game_date: gameDateStr, home_team_abbr: homeAbbr, away_team_abbr: awayAbbr, start_time_utc: game.date || null, status: "final", season })
          .select("game_key").single();
        gameKey = newCg?.game_key;
        created++;
      }

      if (gameKey) {
        newIdMaps.push({ provider: "api-basketball", provider_game_id: apiGameId, game_key: gameKey, league: "NCAAB", match_method: "backfill_exact", confidence: 100 });
      }
    } else {
      skipped++;
    }

    if (!gameKey) continue;

    // Sync to games table
    const statusShort = game.status?.short || "FT";
    const ourStatus = mapStatus(statusShort);
    gamesTableRows.push({
      external_id: `api-basketball-ncaab-${apiGameId}`,
      league: "NCAAB",
      home_team: homeName,
      away_team: awayName,
      home_abbr: homeAbbr,
      away_abbr: awayAbbr,
      start_time: game.date || `${gameDateStr}T00:00:00Z`,
      status: ourStatus,
      home_score: game.scores?.home?.total ?? null,
      away_score: game.scores?.away?.total ?? null,
      venue: game.arena?.name || null,
      source: "api-basketball",
      updated_at: new Date().toISOString(),
    });

    const homeScores = game.scores?.home || {};
    const awayScores = game.scores?.away || {};
    const periodMap: Record<string, number> = { quarter_1: 1, quarter_2: 2, quarter_3: 3, quarter_4: 4, over_time: 5, half_1: 1, half_2: 2 };

    for (const [key, period] of Object.entries(periodMap)) {
      const homePts = homeScores[key];
      const awayPts = awayScores[key];
      if (homePts == null && awayPts == null) continue;
      allPeriodRows.push({ game_key: gameKey, provider: "api-basketball", period, team_abbr: homeAbbr, pts: homePts ?? 0, updated_at: new Date().toISOString() });
      allPeriodRows.push({ game_key: gameKey, provider: "api-basketball", period, team_abbr: awayAbbr, pts: awayPts ?? 0, updated_at: new Date().toISOString() });
    }
  }

  // Batch writes
  if (newIdMaps.length > 0) {
    await supabase.from("cosmic_game_id_map").upsert(newIdMaps, { onConflict: "provider,provider_game_id" });
  }
  if (allPeriodRows.length > 0) {
    for (let i = 0; i < allPeriodRows.length; i += 200) {
      await supabase.from("pbp_quarter_team_stats").upsert(
        allPeriodRows.slice(i, i + 200),
        { onConflict: "game_key,provider,period,team_abbr" }
      );
    }
  }
  // Sync to games table in batches
  if (gamesTableRows.length > 0) {
    for (let i = 0; i < gamesTableRows.length; i += 50) {
      await supabase.from("games").upsert(
        gamesTableRows.slice(i, i + 50),
        { onConflict: "external_id" }
      );
    }
  }

  logMsg(`Done: ${batch.length} processed, ${created} created, ${skipped} skipped, ${allPeriodRows.length} period rows`);

  let nextCall: any = null;
  if (moreOnThisDay) {
    nextCall = { start_date: dateStr, end_date: endDate, offset: offset + limit };
  } else {
    const nextDate = new Date(new Date(dateStr + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
    if (nextDate <= endDate) {
      nextCall = { start_date: nextDate, end_date: endDate, offset: 0 };
    }
  }

  return {
    total: allGames.length, finished: finishedGames.length,
    processed: batch.length, created, skipped,
    periods_written: allPeriodRows.length,
    next_call: nextCall,
  };
}
// ── MODE: backfill_h2h — fetch head-to-head for a team ────────────────────
async function backfillH2H(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  season: string,
  teamId: string,
  writeMode: string,
  addLog: (msg: string) => void,
  t0: number
) {
  addLog(`Backfill H2H for team ${teamId}, season=${season}`);

  const resp = await fetch(
    `${API_BASKETBALL_BASE}/games?league=${NCAAB_LEAGUE_ID}&season=${season}&team=${teamId}`,
    { headers: { "x-apisports-key": apiKey } }
  );

  if (!resp.ok) {
    addLog(`H2H fetch failed: ${resp.status}`);
    return new Response(
      JSON.stringify({ error: `H2H fetch failed: ${resp.status}`, log }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const json = await resp.json();
  const games = json.response || [];
  addLog(`Team ${teamId} games: ${games.length}`);

  let processed = 0;
  for (const game of games) {
    const statusShort = game.status?.short || "NS";
    if (statusShort !== "FT" && statusShort !== "AOT") continue;
    await processGame(supabase, game, writeMode, addLog);
    processed++;
  }

  return new Response(
    JSON.stringify({
      success: true, mode: "backfill_h2h",
      team_id: teamId, total_games: games.length, processed,
      write_mode: writeMode, log, latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
