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

// Default seasons to try per league
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

/**
 * Backfill a single league for a single season.
 * Uses external_id (TheSportsDB idEvent) as the primary match key.
 * Falls back to home_abbr|away_abbr|date if external_id is missing.
 */
async function backfillLeagueSeason(
  apiKey: string,
  supabase: any,
  league: string,
  season: string,
  insertMissing = false,
): Promise<{ events_fetched: number; games_updated: number; games_inserted: number; skipped: number; log: string[] }> {
  const log: string[] = [];
  const leagueId = LEAGUE_IDS[league];

  // ── 1. Fetch season events ──────────────────────────────────────────────
  const allEvents = await fetchSeasonEvents(apiKey, leagueId, season);

  // Filter to completed events with scores
  const finalEvents = allEvents.filter(ev => {
    const isFinal = ["FT", "AOT", "AP", "AET", "PEN"].includes(ev.strStatus);
    const hasScores = ev.intHomeScore != null && ev.intAwayScore != null &&
                      ev.intHomeScore !== "" && ev.intAwayScore !== "";
    return isFinal && hasScores;
  });

  log.push(`${league} ${season}: ${allEvents.length} total, ${finalEvents.length} final with scores`);

  if (finalEvents.length === 0) {
    return { events_fetched: allEvents.length, games_updated: 0, games_inserted: 0, skipped: 0, log };
  }

  // ── 2. Fetch all DB games for this league (paginated, full dataset) ─────
  const allGames: any[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch, error } = await supabase
      .from("games")
      .select("id, home_abbr, away_abbr, start_time, home_score, away_score, status, external_id")
      .eq("league", league)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { log.push(`DB fetch error page ${page}: ${error.message}`); break; }
    if (!batch || batch.length === 0) break;
    allGames.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  log.push(`${league}: ${allGames.length} games in DB`);

  // ── 3. Build lookup indexes ─────────────────────────────────────────────
  // Primary: external_id (most reliable)
  const byExternalId = new Map<string, any>();
  for (const g of allGames) {
    if (g.external_id) byExternalId.set(String(g.external_id), g);
  }

  // Fallback: home_abbr|away_abbr|date (±2 day window)
  const byMatchup = new Map<string, any>();
  for (const g of allGames) {
    const d = g.start_time.split("T")[0];
    const dt = new Date(d);
    for (let offset = -2; offset <= 2; offset++) {
      const shifted = new Date(dt.getTime() + offset * 86400000).toISOString().split("T")[0];
      const key = `${g.home_abbr}|${g.away_abbr}|${shifted}`;
      if (!byMatchup.has(key)) byMatchup.set(key, g);
    }
  }

  // ── 4. Match events → games ─────────────────────────────────────────────
  const pendingUpdates: { id: string; home_score: number; away_score: number; external_id: string }[] = [];
  const pendingInserts: any[] = [];
  let skipped = 0;
  let alreadyFinal = 0;
  const unmatchedSamples: string[] = [];

  for (const ev of finalEvents) {
    const homeScore = parseInt(ev.intHomeScore);
    const awayScore = parseInt(ev.intAwayScore);
    if (isNaN(homeScore) || isNaN(awayScore)) { skipped++; continue; }

    const evId = ev.idEvent ? String(ev.idEvent) : null;

    // Try external_id match first
    let existing = evId ? byExternalId.get(evId) : null;

    // Fallback: abbr + date
    if (!existing) {
      const homeAbbr = getAbbr(league, ev.strHomeTeam);
      const awayAbbr = getAbbr(league, ev.strAwayTeam);
      if (homeAbbr && awayAbbr && ev.dateEvent) {
        existing = byMatchup.get(`${homeAbbr}|${awayAbbr}|${ev.dateEvent}`);
      }

      if (!existing && (homeAbbr === null || awayAbbr === null)) {
        if (unmatchedSamples.length < 5) {
          unmatchedSamples.push(`No abbr: "${ev.strHomeTeam}" vs "${ev.strAwayTeam}"`);
        }
        skipped++;
        continue;
      }
    }

    if (!existing) {
      // Game missing from DB — insert if requested
      if (insertMissing && ev.dateEvent) {
        const homeAbbr = getAbbr(league, ev.strHomeTeam);
        const awayAbbr = getAbbr(league, ev.strAwayTeam);
        if (homeAbbr && awayAbbr) {
          pendingInserts.push({
            league,
            home_team: ev.strHomeTeam,
            away_team: ev.strAwayTeam,
            home_abbr: homeAbbr,
            away_abbr: awayAbbr,
            start_time: ev.dateEvent + "T00:00:00Z",
            home_score: homeScore,
            away_score: awayScore,
            status: "final",
            source: "thesportsdb",
            external_id: evId,
            venue: ev.strVenue || null,
          });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    // Already correct?
    if (existing.status === "final" &&
        existing.home_score === homeScore &&
        existing.away_score === awayScore) {
      alreadyFinal++;
      continue;
    }

    pendingUpdates.push({ id: existing.id, home_score: homeScore, away_score: awayScore, external_id: evId || "" });
  }

  if (unmatchedSamples.length > 0) log.push(...unmatchedSamples);

  log.push(`${league} ${season}: ${pendingUpdates.length} to update, ${alreadyFinal} already final, ${skipped} unmatched`);
  if (insertMissing) log.push(`${league} ${season}: ${pendingInserts.length} to insert`);

  // ── 5. Bulk update ─────────────────────────────────────────────────────
  let gamesUpdated = 0;
  const BATCH = 50;
  for (let i = 0; i < pendingUpdates.length; i += BATCH) {
    const batch = pendingUpdates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from("games")
          .update({
            home_score: u.home_score,
            away_score: u.away_score,
            status: "final",
            // Backfill external_id if we now know it
            ...(u.external_id ? { external_id: u.external_id } : {}),
          })
          .eq("id", u.id)
      )
    );
    gamesUpdated += results.filter((r: any) => !r.error).length;
    if (i + BATCH < pendingUpdates.length) await delay(150);
  }

  // ── 6. Insert missing ──────────────────────────────────────────────────
  let gamesInserted = 0;
  if (insertMissing && pendingInserts.length > 0) {
    const INSERT_BATCH = 100;
    for (let i = 0; i < pendingInserts.length; i += INSERT_BATCH) {
      const batch = pendingInserts.slice(i, i + INSERT_BATCH);
      const { error } = await supabase
        .from("games")
        .upsert(batch, { onConflict: "external_id", ignoreDuplicates: false });
      if (!error) gamesInserted += batch.length;
      else log.push(`Insert error batch ${i}: ${error.message}`);
      if (i + INSERT_BATCH < pendingInserts.length) await delay(200);
    }
    log.push(`${league} ${season}: ✅ inserted ${gamesInserted} games`);
  }

  log.push(`${league} ${season}: ✅ updated ${gamesUpdated} games to final`);

  return {
    events_fetched: allEvents.length,
    games_updated: gamesUpdated,
    games_inserted: gamesInserted,
    skipped,
    log,
  };
}

async function fixStatusCases(supabase: any): Promise<{ fixed_capitalization: number; fixed_has_scores: number; log: string[] }> {
  const log: string[] = [];
  let fixedCap = 0;
  let fixedScored = 0;

  const badStatuses = ["Final", "Final/OT", "Final/2OT", "Final/3OT", "FT", "AOT"];
  for (const s of badStatuses) {
    const { data: rows } = await supabase.from("games").select("id").eq("status", s).limit(2000);
    if (rows?.length) {
      await supabase.from("games").update({ status: "final" }).in("id", rows.map((r: any) => r.id));
      fixedCap += rows.length;
      log.push(`  Normalized "${s}" → "final": ${rows.length} games`);
    }
  }
  if (fixedCap > 0) log.push(`Status capitalization fix: ${fixedCap} games normalized`);

  // Any game with scores but status != "final"
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
    log.push(`Fixed ${fixedScored} scored games stuck as non-final`);
  }

  return { fixed_capitalization: fixedCap, fixed_has_scores: fixedScored, log };
}

async function purgeOrphans(
  supabase: any,
  leagues: string[],
  cutoff: string,
): Promise<{ total_deleted: number; log: string[] }> {
  const log: string[] = [];
  let totalDeleted = 0;

  for (const league of leagues) {
    const { data: candidates } = await supabase
      .from("games")
      .select("id")
      .eq("league", league)
      .eq("status", "scheduled")
      .is("home_score", null)
      .is("away_score", null)
      .lt("start_time", cutoff);

    if (!candidates?.length) { log.push(`${league}: no orphan candidates`); continue; }

    const candidateIds = candidates.map((r: any) => r.id);

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
    if (!orphanIds.length) { log.push(`${league}: ${candidateIds.length} candidates all protected`); continue; }

    const BATCH = 200;
    let deleted = 0;
    for (let i = 0; i < orphanIds.length; i += BATCH) {
      const { error } = await supabase.from("games").delete().in("id", orphanIds.slice(i, i + BATCH));
      if (!error) deleted += Math.min(BATCH, orphanIds.length - i);
    }
    totalDeleted += deleted;
    log.push(`${league}: deleted ${deleted} orphans (${protected_ids.size} protected)`);
  }

  return { total_deleted: totalDeleted, log };
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

    // ── Mode: fix_statuses ─────────────────────────────────────────────────
    if (body.mode === "fix_statuses") {
      const result = await fixStatusCases(supabase);
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Mode: purge_orphans ────────────────────────────────────────────────
    if (body.mode === "purge_orphans") {
      const leagues: string[] = body.leagues
        ? body.leagues.map((l: string) => l.toUpperCase())
        : ["NBA", "NFL", "NHL", "MLB"];
      const cutoff = body.cutoff || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = await purgeOrphans(supabase, leagues, cutoff);
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Mode: backfill (default) ───────────────────────────────────────────
    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THESPORTSDB_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requestedLeagues: string[] = body.leagues
      ? body.leagues.map((l: string) => l.toUpperCase())
      : ["NBA", "NFL", "NHL", "MLB"];

    // Allow single-season override to keep runs short (avoids timeout)
    // e.g. { leagues: ["NHL"], season: "2024-2025" }
    const seasonOverride: string | undefined = body.season;
    const insertMissing: boolean = body.insert_missing === true;

    // Pre-fix statuses first
    const statusFix = await fixStatusCases(supabase);
    const fullLog: string[] = [
      `Pre-fix: ${statusFix.fixed_capitalization} cap fixes, ${statusFix.fixed_has_scores} scored-but-scheduled fixes`,
      ...statusFix.log,
    ];

    const perLeague: any[] = [];
    let totalUpdated = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const league of requestedLeagues) {
      if (!LEAGUE_IDS[league]) { fullLog.push(`Skipping unknown league: ${league}`); continue; }

      const seasons = seasonOverride
        ? [seasonOverride]
        : (LEAGUE_SEASONS[league] || []);

      let leagueUpdated = 0;
      let leagueInserted = 0;
      let leagueSkipped = 0;
      let leagueEvents = 0;
      const leagueLog: string[] = [];

      for (const season of seasons) {
        const r = await backfillLeagueSeason(apiKey, supabase, league, season, insertMissing);
        leagueUpdated += r.games_updated;
        leagueInserted += r.games_inserted;
        leagueSkipped += r.skipped;
        leagueEvents += r.events_fetched;
        leagueLog.push(...r.log);
        // Pause between season fetches to avoid rate limits
        if (seasons.indexOf(season) < seasons.length - 1) await delay(700);
      }

      perLeague.push({ league, events_fetched: leagueEvents, games_updated: leagueUpdated, games_inserted: leagueInserted, skipped: leagueSkipped, log: leagueLog });
      totalUpdated += leagueUpdated;
      totalInserted += leagueInserted;
      totalSkipped += leagueSkipped;
      fullLog.push(...leagueLog);

      // Pause between leagues
      if (requestedLeagues.indexOf(league) < requestedLeagues.length - 1) await delay(800);
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_updated: totalUpdated,
        total_inserted: totalInserted,
        total_skipped: totalSkipped,
        status_fixes: statusFix,
        leagues: perLeague,
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
