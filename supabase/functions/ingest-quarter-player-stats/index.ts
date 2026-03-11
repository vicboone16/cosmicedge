import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Ingest per-period (Q1–Q4, 1H, 2H, OT) player stats into player_game_stats.
 * 
 * Accepts TWO formats:
 * 
 * FORMAT 1: Raw BDL API response (auto-detected when items have .player.id)
 *   POST { "period": 1, "data": [ ...BDL stats array... ] }
 *   - Resolves BDL game IDs and player names → internal UUIDs
 *   - period param: 1=Q1, 2=Q2, 3=Q3, 4=Q4 (or pass "Q1" string)
 * 
 * FORMAT 2: Pre-resolved internal format
 *   POST { "stats": [ { game_id, player_id, period, points, ... } ] }
 * 
 * SAFETY: period='full' rows are NEVER written.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    // Detect format
    const isBdlFormat = Array.isArray(body.data) && body.data.length > 0 && body.data[0]?.player;

    if (isBdlFormat) {
      return await handleBdlFormat(supabase, body, t0);
    } else if (Array.isArray(body.stats)) {
      return await handleInternalFormat(supabase, body.stats, t0);
    } else {
      return new Response(
        JSON.stringify({ error: "Provide either 'data' (BDL format) or 'stats' (internal format)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[ingest-quarter-player-stats] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── BDL Format Handler ───
async function handleBdlFormat(supabase: any, body: any, t0: number) {
  const bdlStats = body.data as any[];
  const periodParam = body.period; // number (1-4) or string ("Q1")

  const periodLabel = normalizePeriod(periodParam);
  if (!periodLabel || periodLabel === "FULL") {
    return new Response(
      JSON.stringify({ error: `Invalid or protected period: ${periodParam}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Collect unique BDL game IDs to resolve
  const bdlGameIds = [...new Set(bdlStats.map(s => s.game?.id).filter(Boolean))];
  const gameIdMap = await resolveBdlGameIds(supabase, bdlGameIds, bdlStats);

  // Resolve players by name + team
  const rows: any[] = [];
  const rejected: any[] = [];

  for (const s of bdlStats) {
    const playerName = `${s.player?.first_name} ${s.player?.last_name}`.trim();
    const teamAbbr = s.team?.abbreviation || null;
    const bdlGameId = s.game?.id;

    const internalGameId = gameIdMap.get(bdlGameId);
    if (!internalGameId) {
      rejected.push({ reason: `Could not resolve BDL game ${bdlGameId}`, player: playerName });
      continue;
    }

    // Resolve player by name fuzzy match + team
    const playerId = await resolvePlayer(supabase, playerName, teamAbbr);
    if (!playerId) {
      rejected.push({ reason: `Could not resolve player '${playerName}' (${teamAbbr})`, bdl_player_id: s.player?.id });
      continue;
    }

    rows.push({
      game_id: internalGameId,
      player_id: playerId,
      team_abbr: teamAbbr,
      period: periodLabel,
      points: s.pts ?? 0,
      rebounds: s.reb ?? 0,
      assists: s.ast ?? 0,
      steals: s.stl ?? 0,
      blocks: s.blk ?? 0,
      turnovers: s.turnover ?? 0,
      minutes: s.min ? parseInt(s.min, 10) : 0,
      fg_made: s.fgm ?? 0,
      fg_attempted: s.fga ?? 0,
      three_made: s.fg3m ?? 0,
      three_attempted: s.fg3a ?? 0,
      ft_made: s.ftm ?? 0,
      ft_attempted: s.fta ?? 0,
      off_rebounds: s.oreb ?? 0,
      def_rebounds: s.dreb ?? 0,
      fouls: s.pf ?? 0,
    });
  }

  const result = await upsertRows(supabase, rows);

  // After upserting quarter rows, auto-compute half aggregates if applicable
  const halfResult = await autoComputeHalves(supabase, rows, periodLabel);

  return new Response(
    JSON.stringify({
      success: result.errors.length === 0,
      format: "bdl",
      period: periodLabel,
      upserted: result.upserted + halfResult.upserted,
      halves_computed: halfResult.upserted,
      rejected: rejected.length,
      rejected_details: rejected.length > 0 ? rejected : undefined,
      errors: result.errors.length > 0 ? result.errors : undefined,
      latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Internal Format Handler ───
async function handleInternalFormat(supabase: any, stats: any[], t0: number) {
  if (stats.length === 0) {
    return new Response(
      JSON.stringify({ error: "stats array is empty" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const ALLOWED_PERIODS = new Set(["Q1", "Q2", "Q3", "Q4", "1H", "2H", "OT", "OT2", "OT3", "OT4"]);
  const rejected: any[] = [];
  const rows: any[] = [];

  for (const s of stats) {
    const period = (s.period || "").toUpperCase();
    if (!s.game_id || !s.player_id || !period) {
      rejected.push({ reason: "missing game_id, player_id, or period", input: s });
      continue;
    }
    if (period === "FULL") {
      rejected.push({ reason: "period='full' is protected", input: s });
      continue;
    }
    if (!ALLOWED_PERIODS.has(period)) {
      rejected.push({ reason: `unknown period '${period}'`, input: s });
      continue;
    }
    rows.push({
      game_id: s.game_id,
      player_id: s.player_id,
      team_abbr: s.team_abbr || null,
      period,
      points: s.points ?? 0,
      rebounds: s.rebounds ?? 0,
      assists: s.assists ?? 0,
      steals: s.steals ?? 0,
      blocks: s.blocks ?? 0,
      turnovers: s.turnovers ?? 0,
      minutes: s.minutes ?? 0,
      fg_made: s.fg_made ?? 0,
      fg_attempted: s.fg_attempted ?? 0,
      three_made: s.three_made ?? 0,
      three_attempted: s.three_attempted ?? 0,
      ft_made: s.ft_made ?? 0,
      ft_attempted: s.ft_attempted ?? 0,
      off_rebounds: s.off_rebounds ?? 0,
      def_rebounds: s.def_rebounds ?? 0,
      fouls: s.fouls ?? s.personal_fouls ?? 0,
    });
  }

  const result = await upsertRows(supabase, rows);

  return new Response(
    JSON.stringify({
      success: result.errors.length === 0,
      format: "internal",
      upserted: result.upserted,
      rejected: rejected.length,
      rejected_details: rejected.length > 0 ? rejected : undefined,
      errors: result.errors.length > 0 ? result.errors : undefined,
      latency_ms: Date.now() - t0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Helpers ───

function normalizePeriod(p: any): string | null {
  if (typeof p === "number") {
    if (p >= 1 && p <= 4) return `Q${p}`;
    if (p >= 5) return `OT${p - 4 === 1 ? "" : p - 4}`;
    return null;
  }
  if (typeof p === "string") {
    const up = p.toUpperCase();
    if (["Q1", "Q2", "Q3", "Q4", "1H", "2H", "OT", "OT2", "OT3", "OT4", "FULL"].includes(up)) return up;
    // Try numeric string
    const n = parseInt(up);
    if (!isNaN(n)) return normalizePeriod(n);
    return null;
  }
  return null;
}

async function resolveBdlGameIds(supabase: any, bdlGameIds: number[], bdlStats: any[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  for (const bdlId of bdlGameIds) {
    // First try cosmic_game_id_map
    const { data: mapped } = await supabase
      .from("cosmic_game_id_map")
      .select("game_key")
      .eq("provider", "balldontlie")
      .eq("provider_game_id", String(bdlId))
      .limit(1)
      .maybeSingle();

    if (mapped?.game_key) {
      // game_key is the cosmic_games key, resolve to games.id
      const { data: cg } = await supabase
        .from("cosmic_games")
        .select("game_date, home_team_abbr, away_team_abbr")
        .eq("game_key", mapped.game_key)
        .maybeSingle();

      if (cg) {
        const { data: game } = await supabase
          .from("games")
          .select("id")
          .eq("home_abbr", cg.home_team_abbr)
          .eq("away_abbr", cg.away_team_abbr)
          .gte("start_time", cg.game_date + "T00:00:00")
          .lte("start_time", cg.game_date + "T23:59:59")
          .limit(1)
          .maybeSingle();

        if (game?.id) {
          map.set(bdlId, game.id);
          continue;
        }
      }
    }

    // Fallback: match by teams + date from BDL game data
    const sample = bdlStats.find(s => s.game?.id === bdlId);
    if (sample?.game) {
      const g = sample.game;
      const homeTeamAbbr = sample.team?.abbreviation;
      // BDL provides home_team_id and visitor_team_id
      // We need to find teams by the date and team abbrs from the stats
      const gameDate = g.date; // "2026-03-02"

      if (gameDate) {
        const { data: games } = await supabase
          .from("games")
          .select("id")
          .eq("league", "NBA")
          .gte("start_time", gameDate + "T00:00:00")
          .lte("start_time", (gameDate + "T23:59:59").replace(/T23/, "T23"))
          .limit(20);

        if (games && games.length === 1) {
          map.set(bdlId, games[0].id);
          continue;
        }

        // Try ±1 day window with score matching
        const dayBefore = offsetDate(gameDate, -1);
        const dayAfter = offsetDate(gameDate, 1);
        const { data: wideGames } = await supabase
          .from("games")
          .select("id, home_score, away_score, home_abbr, away_abbr")
          .eq("league", "NBA")
          .gte("start_time", dayBefore + "T00:00:00")
          .lte("start_time", dayAfter + "T23:59:59")
          .limit(50);

        if (wideGames) {
          // Match by scores
          const match = wideGames.find((wg: any) =>
            (wg.home_score === g.home_team_score && wg.away_score === g.visitor_team_score) ||
            (wg.home_score === g.visitor_team_score && wg.away_score === g.home_team_score)
          );
          if (match) {
            map.set(bdlId, match.id);
            continue;
          }
        }
      }
    }
  }
  return map;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Player name cache for this request
const playerCache = new Map<string, string | null>();

async function resolvePlayer(supabase: any, name: string, teamAbbr: string | null): Promise<string | null> {
  const cacheKey = `${name}|${teamAbbr}`;
  if (playerCache.has(cacheKey)) return playerCache.get(cacheKey)!;

  // Try exact name match with team
  let query = supabase
    .from("players")
    .select("id")
    .ilike("name", name)
    .limit(1);

  if (teamAbbr) {
    query = query.eq("team", teamAbbr);
  }

  const { data } = await query.maybeSingle();
  if (data?.id) {
    playerCache.set(cacheKey, data.id);
    return data.id;
  }

  // Try without team filter
  const { data: loose } = await supabase
    .from("players")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  const result = loose?.id || null;
  playerCache.set(cacheKey, result);
  return result;
}

async function upsertRows(supabase: any, rows: any[]): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  const CHUNK = 200;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("player_game_stats")
      .upsert(chunk, { onConflict: "game_id,player_id,period" });

    if (error) {
      console.error("[ingest-quarter-player-stats] upsert error:", error.message);
      errors.push(error.message);
    } else {
      upserted += chunk.length;
    }
  }

  return { upserted, errors };
}

/**
 * After ingesting quarter rows, auto-compute 1H/2H aggregates by summing Q1+Q2 / Q3+Q4.
 * Only runs when we just ingested a quarter period (Q1-Q4).
 */
async function autoComputeHalves(supabase: any, rows: any[], periodLabel: string): Promise<{ upserted: number }> {
  if (!["Q1", "Q2", "Q3", "Q4"].includes(periodLabel)) return { upserted: 0 };

  const halfPeriod = ["Q1", "Q2"].includes(periodLabel) ? "1H" : "2H";
  const qPair = halfPeriod === "1H" ? ["Q1", "Q2"] : ["Q3", "Q4"];

  // Collect unique game_id + player_id combos from what we just ingested
  const combos = new Map<string, { game_id: string; player_id: string; team_abbr: string | null }>();
  for (const r of rows) {
    const key = `${r.game_id}|${r.player_id}`;
    if (!combos.has(key)) combos.set(key, { game_id: r.game_id, player_id: r.player_id, team_abbr: r.team_abbr });
  }

  const halfRows: any[] = [];
  for (const { game_id, player_id, team_abbr } of combos.values()) {
    // Fetch both quarters for this player+game
    const { data: qRows } = await supabase
      .from("player_game_stats")
      .select("*")
      .eq("game_id", game_id)
      .eq("player_id", player_id)
      .in("period", qPair);

    if (!qRows || qRows.length < 2) continue;

    // Sum the two quarter rows
    const sum: any = {
      game_id, player_id, team_abbr,
      period: halfPeriod,
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
      minutes: 0, fg_made: 0, fg_attempted: 0, three_made: 0, three_attempted: 0,
      ft_made: 0, ft_attempted: 0, off_rebounds: 0, def_rebounds: 0, fouls: 0,
    };
    for (const q of qRows) {
      sum.points += q.points ?? 0;
      sum.rebounds += q.rebounds ?? 0;
      sum.assists += q.assists ?? 0;
      sum.steals += q.steals ?? 0;
      sum.blocks += q.blocks ?? 0;
      sum.turnovers += q.turnovers ?? 0;
      sum.minutes += q.minutes ?? 0;
      sum.fg_made += q.fg_made ?? 0;
      sum.fg_attempted += q.fg_attempted ?? 0;
      sum.three_made += q.three_made ?? 0;
      sum.three_attempted += q.three_attempted ?? 0;
      sum.ft_made += q.ft_made ?? 0;
      sum.ft_attempted += q.ft_attempted ?? 0;
      sum.off_rebounds += q.off_rebounds ?? 0;
      sum.def_rebounds += q.def_rebounds ?? 0;
      sum.personal_fouls += q.personal_fouls ?? 0;
    }
    halfRows.push(sum);
  }

  if (halfRows.length === 0) return { upserted: 0 };
  return await upsertRows(supabase, halfRows);
}
