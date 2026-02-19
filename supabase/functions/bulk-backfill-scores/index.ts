import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { CANONICAL } from "../_shared/team-mappings.ts";

const BASE = "https://www.thesportsdb.com/api/v1/json";

const LEAGUE_IDS: Record<string, string> = {
  NBA: "4387",
  NFL: "4391",
  NHL: "4380",
  MLB: "4424",
};

// Each league has one or more seasons to backfill
const LEAGUE_SEASONS: Record<string, string[]> = {
  NBA: ["2024-2025", "2025-2026"],
  NFL: ["2024", "2025"],
  NHL: ["2024-2025", "2025-2026"],
  MLB: ["2024", "2025"],
};

function getAbbr(league: string, teamName: string): string | null {
  const dict = CANONICAL[league];
  if (!dict) return null;
  return dict[teamName] || null;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSeasonEvents(apiKey: string, leagueId: string, season: string): Promise<any[]> {
  const url = `${BASE}/${apiKey}/eventsseason.php?id=${leagueId}&s=${season}`;
  console.log(`Fetching: eventsseason id=${leagueId} s=${season}`);
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`API ${resp.status} for season ${season}: ${body.slice(0, 300)}`);
    return [];
  }
  const data = await resp.json();
  return data.events || [];
}

async function fetchPastEvents(apiKey: string, leagueId: string): Promise<any[]> {
  const url = `${BASE}/${apiKey}/eventspastleague.php?id=${leagueId}`;
  console.log(`Fetching: eventspastleague id=${leagueId}`);
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.events || [];
}

async function backfillLeague(
  apiKey: string,
  supabase: any,
  league: string,
  seasons?: string[],
): Promise<{ league: string; events_fetched: number; games_updated: number; skipped: number; log: string[] }> {
  const log: string[] = [];
  const leagueId = LEAGUE_IDS[league];
  const targetSeasons = seasons || LEAGUE_SEASONS[league] || [];

  // ── 1. Fetch all past events from TheSportsDB ──────────────────────────
  let allEvents: any[] = [];

  if (targetSeasons.length > 0) {
    for (const season of targetSeasons) {
      const events = await fetchSeasonEvents(apiKey, leagueId, season);
      log.push(`${league} season ${season}: ${events.length} events from TSDB`);
      allEvents.push(...events);
      if (targetSeasons.length > 1) await delay(600);
    }
  } else {
    // Fallback to recent past events
    const events = await fetchPastEvents(apiKey, leagueId);
    log.push(`${league} past events: ${events.length} from TSDB`);
    allEvents.push(...events);
  }

  // Filter to only final events with scores
  const finalEvents = allEvents.filter(ev => {
    const isFinal = ev.strStatus === "FT" || ev.strStatus === "AOT" || ev.strStatus === "AP" ||
                    ev.strStatus === "AET" || ev.strStatus === "PEN";
    const hasScores = ev.intHomeScore != null && ev.intAwayScore != null &&
                      ev.intHomeScore !== "" && ev.intAwayScore !== "";
    return isFinal && hasScores;
  });

  log.push(`${league}: ${finalEvents.length} final events with scores`);

  if (finalEvents.length === 0) {
    return { league, events_fetched: allEvents.length, games_updated: 0, skipped: allEvents.length, log };
  }

  // ── 2. Pre-fetch ALL games for this league from DB (paginated) ──────────
  const allGames: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch, error } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, home_score, away_score, status")
      .eq("league", league)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { log.push(`DB fetch error page ${page}: ${error.message}`); break; }
    if (!batch || batch.length === 0) break;
    allGames.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  log.push(`${league}: ${allGames.length} games in DB`);

  // ── 3. Build lookup by home|away|date (±2 day window) ──────────────────
  const gameIndex = new Map<string, any>();
  for (const g of allGames) {
    const d = g.start_time.split("T")[0];
    const dt = new Date(d);
    for (let offset = -2; offset <= 2; offset++) {
      const shifted = new Date(dt.getTime() + offset * 86400000).toISOString().split("T")[0];
      const key = `${g.home_abbr}|${g.away_abbr}|${shifted}`;
      if (!gameIndex.has(key)) gameIndex.set(key, g);
    }
  }

  // ── 4. Match events → games, collect updates ───────────────────────────
  const pendingUpdates: { id: string; home_score: number; away_score: number }[] = [];
  let skipped = 0;
  const alreadyFinal = { count: 0 };

  for (const ev of finalEvents) {
    const homeAbbr = getAbbr(league, ev.strHomeTeam);
    const awayAbbr = getAbbr(league, ev.strAwayTeam);

    if (!homeAbbr || !awayAbbr) {
      // Log unmapped teams for diagnosis (only first 5 per league to avoid noise)
      if (skipped < 5) {
        log.push(`  No mapping: "${ev.strHomeTeam}" vs "${ev.strAwayTeam}"`);
      }
      skipped++;
      continue;
    }

    const homeScore = parseInt(ev.intHomeScore);
    const awayScore = parseInt(ev.intAwayScore);
    if (isNaN(homeScore) || isNaN(awayScore)) { skipped++; continue; }

    const key = `${homeAbbr}|${awayAbbr}|${ev.dateEvent}`;
    const existing = gameIndex.get(key);

    if (!existing) {
      skipped++;
      continue;
    }

  // Only update if scores differ OR status isn't already normalised "final"
    const isAlreadyFinal = existing.status === "final" &&
      existing.home_score === homeScore &&
      existing.away_score === awayScore;

    if (isAlreadyFinal) {
      alreadyFinal.count++;
      continue;
    }

    pendingUpdates.push({ id: existing.id, home_score: homeScore, away_score: awayScore });
  }

  log.push(`${league}: ${pendingUpdates.length} games need update, ${alreadyFinal.count} already final, ${skipped} unmatched`);

  // ── 5. Execute bulk updates in parallel batches of 50 ──────────────────
  let gamesUpdated = 0;
  const BATCH = 50;
  for (let i = 0; i < pendingUpdates.length; i += BATCH) {
    const batch = pendingUpdates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from("games")
          .update({ home_score: u.home_score, away_score: u.away_score, status: "final" })
          .eq("id", u.id)
      )
    );
    gamesUpdated += results.filter((r: any) => !r.error).length;
    if (i + BATCH < pendingUpdates.length) await delay(200);
  }

  log.push(`${league}: ✅ updated ${gamesUpdated} games to final`);

  return {
    league,
    events_fetched: allEvents.length,
    games_updated: gamesUpdated,
    skipped,
    log,
  };
}

async function fixStatusCases(supabase: any): Promise<{ fixed_capitalization: number; fixed_has_scores: number; log: string[] }> {
  const log: string[] = [];
  let fixedCap = 0;
  let fixedScored = 0;

  // 1. Try RPC first, fallback to manual
  const { data: capFix, error: capErr } = await supabase.rpc("fix_game_status_cases");
  if (capErr) {
    // Fallback: manual update for capitalized variants
    const badStatuses = ["Final", "Final/OT", "Final/2OT", "Final/3OT", "FT", "AOT"];
    for (const s of badStatuses) {
      const { data: rows } = await supabase.from("games").select("id").eq("status", s).limit(2000);
      if (rows?.length) {
        await supabase.from("games").update({ status: "final" }).in("id", rows.map((r: any) => r.id));
        fixedCap += rows.length;
        log.push(`  Normalized "${s}" → "final": ${rows.length} games`);
      }
    }
    log.push(`Status capitalization fix: ${fixedCap} games normalized`);
  } else {
    fixedCap = capFix ?? 0;
    log.push(`Status capitalization fix: ${fixedCap} games normalized`);
  }

  // 2. Any game with scores but status != "final" (always run this regardless of RPC result)
  const { data: scoredRows } = await supabase
    .from("games")
    .select("id")
    .neq("status", "final")
    .neq("status", "live")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(5000);

  if (scoredRows?.length) {
    const ids = scoredRows.map((r: any) => r.id);
    const BATCH = 200;
    for (let i = 0; i < ids.length; i += BATCH) {
      await supabase.from("games").update({ status: "final" }).in("id", ids.slice(i, i + BATCH));
    }
    fixedScored = scoredRows.length;
    log.push(`Fixed ${fixedScored} games with scores stuck as non-final`);
  }

  return { fixed_capitalization: fixedCap, fixed_has_scores: fixedScored, log };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Special mode: just fix status casing without hitting TheSportsDB
    if (body.mode === "fix_statuses") {
      const result = await fixStatusCases(supabase);
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Special mode: delete orphan scheduled games (no scores, bets, odds, or stats)
    if (body.mode === "purge_orphans") {
      const leagues: string[] = body.leagues
        ? body.leagues.map((l: string) => l.toUpperCase())
        : ["NBA", "NFL", "NHL", "MLB"];
      const cutoff = body.cutoff || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const log: string[] = [];
      let totalDeleted = 0;

      for (const league of leagues) {
        // Find scheduled games before cutoff with no scores
        const { data: candidates } = await supabase
          .from("games")
          .select("id")
          .eq("league", league)
          .eq("status", "scheduled")
          .is("home_score", null)
          .is("away_score", null)
          .lt("start_time", cutoff);

        if (!candidates?.length) {
          log.push(`${league}: no orphan candidates`);
          continue;
        }

        const candidateIds = candidates.map((r: any) => r.id);

        // Filter out any that have bets, odds, or stats attached
        const [betsRes, oddsRes, statsRes] = await Promise.all([
          supabase.from("bets").select("game_id").in("game_id", candidateIds),
          supabase.from("odds_snapshots").select("game_id").in("game_id", candidateIds),
          supabase.from("player_game_stats").select("game_id").in("game_id", candidateIds),
        ]);

        const protected_ids = new Set([
          ...(betsRes.data || []).map((r: any) => r.game_id),
          ...(oddsRes.data || []).map((r: any) => r.game_id),
          ...(statsRes.data || []).map((r: any) => r.game_id),
        ]);

        const orphanIds = candidateIds.filter((id: string) => !protected_ids.has(id));

        if (!orphanIds.length) {
          log.push(`${league}: ${candidateIds.length} candidates all protected`);
          continue;
        }

        // Delete in batches
        const BATCH = 200;
        let deleted = 0;
        for (let i = 0; i < orphanIds.length; i += BATCH) {
          const { error } = await supabase.from("games").delete().in("id", orphanIds.slice(i, i + BATCH));
          if (!error) deleted += Math.min(BATCH, orphanIds.length - i);
        }
        totalDeleted += deleted;
        log.push(`${league}: deleted ${deleted} orphan scheduled games (${protected_ids.size} protected)`);
      }

      return new Response(
        JSON.stringify({ success: true, total_deleted: totalDeleted, log }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THESPORTSDB_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Which leagues to backfill — defaults to all four
    const requestedLeagues: string[] = body.leagues
      ? body.leagues.map((l: string) => l.toUpperCase())
      : ["NBA", "NFL", "NHL", "MLB"];

    // Optional per-call season override (e.g. { seasons: ["2024-2025"] })
    const seasonOverride: string[] | undefined = body.seasons;

    const results: any[] = [];
    let totalUpdated = 0;
    const fullLog: string[] = [];

    // Always fix status casing first before backfilling
    const statusFix = await fixStatusCases(supabase);
    fullLog.push(`Pre-fix: ${statusFix.fixed_capitalization} capitalization fixes, ${statusFix.fixed_has_scores} scored-but-scheduled fixes`);
    fullLog.push(...statusFix.log);

    for (const league of requestedLeagues) {
      if (!LEAGUE_IDS[league]) {
        fullLog.push(`Skipping unknown league: ${league}`);
        continue;
      }

      console.log(`--- Backfilling ${league} ---`);
      const result = await backfillLeague(apiKey, supabase, league, seasonOverride);
      results.push(result);
      totalUpdated += result.games_updated;
      fullLog.push(...result.log);

      // Brief pause between leagues to avoid rate limiting
      if (requestedLeagues.indexOf(league) < requestedLeagues.length - 1) {
        await delay(800);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_updated: totalUpdated,
        status_fixes: statusFix,
        leagues: results,
        log: fullLog,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("bulk-backfill-scores error:", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
