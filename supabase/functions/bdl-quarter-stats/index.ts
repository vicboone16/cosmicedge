/**
 * bdl-quarter-stats — Fetch per-quarter player stats from BDL API and ingest them.
 *
 * Usage:
 *   GET /bdl-quarter-stats?date=2026-03-02
 *   GET /bdl-quarter-stats?date=2026-03-02&game_ids=18447700,18447701
 *
 * Fetches periods 1-4 + OT1/OT2 for all NBA games on that date,
 * resolves BDL IDs → internal game/player UUIDs, and upserts into player_game_stats.
 * Auto-computes 1H (Q1+Q2) and 2H (Q3+Q4) aggregates.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BDL_BASE = "https://api.balldontlie.io";
const STAT_FIELDS = [
  "points", "rebounds", "assists", "steals", "blocks", "turnovers",
  "minutes", "fg_made", "fg_attempted", "three_made", "three_attempted",
  "ft_made", "ft_attempted", "off_rebounds", "def_rebounds", "personal_fouls",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const BDL_KEY = (Deno.env.get("BALLDONTLIE_KEY") || "").trim().replace(/^Bearer\s+/i, "");
    if (!BDL_KEY) throw new Error("BALLDONTLIE_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hdrs = { Authorization: `Bearer ${BDL_KEY}`, "X-Api-Key": BDL_KEY };

    const url = new URL(req.url);
    const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
    const filterGameIds = url.searchParams.get("game_ids")?.split(",").map(Number).filter(Boolean) || [];
    const season = url.searchParams.get("season") || "2025";

    // Step 1: Find BDL games for this date
    const gamesRes = await fetch(`${BDL_BASE}/v1/games?dates[]=${targetDate}&seasons[]=${season}&per_page=100`, { headers: hdrs });
    if (!gamesRes.ok) throw new Error(`BDL games API returned ${gamesRes.status}`);
    const gamesData = await gamesRes.json();
    let bdlGames: any[] = gamesData.data || [];

    if (filterGameIds.length > 0) {
      bdlGames = bdlGames.filter((g: any) => filterGameIds.includes(g.id));
    }

    if (bdlGames.length === 0) {
      return json({ ok: true, msg: "No BDL games found", date: targetDate, latency_ms: Date.now() - t0 });
    }

    console.log(`[bdl-quarter-stats] ${bdlGames.length} games on ${targetDate}`);

    // Step 2: Resolve BDL game IDs → internal game UUIDs
    const gameIdMap = new Map<number, string>();
    for (const g of bdlGames) {
      const internalId = await resolveBdlGame(supabase, g);
      if (internalId) gameIdMap.set(g.id, internalId);
      else console.warn(`[bdl-quarter-stats] Could not resolve BDL game ${g.id} (${g.home_team?.abbreviation} vs ${g.visitor_team?.abbreviation})`);
    }

    // Step 3: Determine which periods to fetch
    // Always fetch Q1-Q4. Check if any game went to OT.
    const periodsToFetch = [1, 2, 3, 4];
    for (const g of bdlGames) {
      if (g.period > 4) {
        for (let ot = 5; ot <= g.period; ot++) {
          if (!periodsToFetch.includes(ot)) periodsToFetch.push(ot);
        }
      }
    }

    const stats = { total_rows: 0, periods_fetched: 0, halves_computed: 0, games_resolved: gameIdMap.size, games_total: bdlGames.length, errors: [] as string[] };
    const playerCache = new Map<string, string | null>();

    // Step 4: Fetch stats for each period
    for (const period of periodsToFetch) {
      const periodLabel = period <= 4 ? `Q${period}` : (period === 5 ? "OT" : `OT${period - 4}`);
      console.log(`[bdl-quarter-stats] Fetching period ${periodLabel}...`);

      const allBdlIds = [...gameIdMap.keys()];
      const idsParam = allBdlIds.map(id => `game_ids[]=${id}`).join("&");

      let page = 1;
      let hasMore = true;
      const periodRows: any[] = [];

      while (hasMore) {
        const statsUrl = `${BDL_BASE}/v1/stats?seasons[]=${season}&period=${period}&dates[]=${targetDate}&per_page=100&page=${page}${filterGameIds.length ? "&" + filterGameIds.map(id => `game_ids[]=${id}`).join("&") : ""}`;
        const res = await fetch(statsUrl, { headers: hdrs });

        if (res.status === 429) {
          console.warn(`[bdl-quarter-stats] Rate limited on period ${periodLabel}, waiting...`);
          await sleep(2000);
          continue;
        }
        if (!res.ok) {
          stats.errors.push(`Period ${periodLabel} page ${page}: HTTP ${res.status}`);
          break;
        }

        const data = await res.json();
        const items: any[] = data.data || [];

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const s of items) {
          const bdlGameId = s.game?.id;
          const internalGameId = gameIdMap.get(bdlGameId);
          if (!internalGameId) continue;

          const playerName = `${s.player?.first_name || ""} ${s.player?.last_name || ""}`.trim();
          const teamAbbr = s.team?.abbreviation || null;
          const playerId = await resolvePlayer(supabase, playerName, teamAbbr, playerCache);
          if (!playerId) {
            console.warn(`[bdl-quarter-stats] Unresolved player: ${playerName} (${teamAbbr})`);
            continue;
          }

          periodRows.push({
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
            personal_fouls: s.pf ?? 0,
          });
        }

        // BDL pagination: if we got a full page, there might be more
        hasMore = items.length === 100;
        page++;
      }

      // Upsert this period's rows
      if (periodRows.length > 0) {
        const { error } = await batchUpsert(supabase, periodRows);
        if (error) stats.errors.push(`Upsert ${periodLabel}: ${error}`);
        stats.total_rows += periodRows.length;
        stats.periods_fetched++;
        console.log(`[bdl-quarter-stats] ${periodLabel}: ${periodRows.length} rows upserted`);
      }

      await sleep(300); // Rate limit courtesy
    }

    // Step 5: Auto-compute halves (1H = Q1+Q2, 2H = Q3+Q4)
    const halvesComputed = await computeAllHalves(supabase, gameIdMap);
    stats.halves_computed = halvesComputed;

    console.log(`[bdl-quarter-stats] Done: ${JSON.stringify(stats)}`);
    return json({ ok: true, date: targetDate, stats, latency_ms: Date.now() - t0 });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[bdl-quarter-stats] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ─── Helpers ───

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function resolveBdlGame(supabase: any, bdlGame: any): Promise<string | null> {
  const homeAbbr = bdlGame.home_team?.abbreviation;
  const awayAbbr = bdlGame.visitor_team?.abbreviation;
  const gameDate = bdlGame.date; // "2026-03-02"

  if (!homeAbbr || !awayAbbr || !gameDate) return null;

  // Try direct match
  const dayBefore = offsetDate(gameDate, -1);
  const dayAfter = offsetDate(gameDate, 1);

  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("league", "NBA")
    .eq("home_abbr", homeAbbr)
    .eq("away_abbr", awayAbbr)
    .gte("start_time", dayBefore + "T00:00:00")
    .lte("start_time", dayAfter + "T23:59:59")
    .limit(1);

  if (games?.[0]?.id) return games[0].id;

  // Try score match as fallback
  if (bdlGame.home_team_score && bdlGame.visitor_team_score) {
    const { data: scoreGames } = await supabase
      .from("games")
      .select("id")
      .eq("league", "NBA")
      .eq("home_score", bdlGame.home_team_score)
      .eq("away_score", bdlGame.visitor_team_score)
      .gte("start_time", dayBefore + "T00:00:00")
      .lte("start_time", dayAfter + "T23:59:59")
      .limit(1);

    if (scoreGames?.[0]?.id) return scoreGames[0].id;
  }

  return null;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function resolvePlayer(supabase: any, name: string, teamAbbr: string | null, cache: Map<string, string | null>): Promise<string | null> {
  const key = `${name}|${teamAbbr}`;
  if (cache.has(key)) return cache.get(key)!;

  let query = supabase.from("players").select("id").ilike("name", name).limit(1);
  if (teamAbbr) query = query.eq("team", teamAbbr);

  const { data } = await query.maybeSingle();
  if (data?.id) { cache.set(key, data.id); return data.id; }

  // Without team filter
  const { data: loose } = await supabase.from("players").select("id").ilike("name", name).limit(1).maybeSingle();
  const result = loose?.id || null;
  cache.set(key, result);
  return result;
}

async function batchUpsert(supabase: any, rows: any[]): Promise<{ error: string | null }> {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("player_game_stats")
      .upsert(chunk, { onConflict: "game_id,player_id,period" });
    if (error) return { error: error.message };
  }
  return { error: null };
}

async function computeAllHalves(supabase: any, gameIdMap: Map<number, string>): Promise<number> {
  const internalGameIds = [...new Set(gameIdMap.values())];
  let computed = 0;

  for (const gameId of internalGameIds) {
    for (const [halfPeriod, qPair] of [["1H", ["Q1", "Q2"]], ["2H", ["Q3", "Q4"]]] as const) {
      const { data: qRows } = await supabase
        .from("player_game_stats")
        .select("*")
        .eq("game_id", gameId)
        .in("period", qPair);

      if (!qRows || qRows.length === 0) continue;

      // Group by player_id
      const byPlayer = new Map<string, any[]>();
      for (const r of qRows) {
        const arr = byPlayer.get(r.player_id) || [];
        arr.push(r);
        byPlayer.set(r.player_id, arr);
      }

      const halfRows: any[] = [];
      for (const [playerId, pRows] of byPlayer) {
        if (pRows.length < 2) continue;
        const sum: any = {
          game_id: gameId, player_id: playerId, team_abbr: pRows[0].team_abbr, period: halfPeriod,
        };
        for (const f of STAT_FIELDS) sum[f] = 0;
        for (const r of pRows) {
          for (const f of STAT_FIELDS) sum[f] += r[f] ?? 0;
        }
        halfRows.push(sum);
      }

      if (halfRows.length > 0) {
        await batchUpsert(supabase, halfRows);
        computed += halfRows.length;
      }
    }
  }
  return computed;
}
