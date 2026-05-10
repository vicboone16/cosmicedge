import { corsHeaders } from "../_shared/cors.ts";
import { verifyCronAuth } from "../_shared/cron-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Normalize ESPN abbreviations to canonical DB abbreviations
const ABBR_NORMALIZE: Record<string, Record<string, string>> = {
  NHL: { NJ: "NJD", TB: "TBL", LA: "LAK", SJ: "SJS", VEG: "VGK", WAS: "WSH", UM: "UTA" },
  NFL: { JAC: "JAX" },
};
function normalizeAbbr(league: string, abbr: string): string {
  return ABBR_NORMALIZE[league]?.[abbr] || abbr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronDenied = verifyCronAuth(req);
  if (cronDenied) return cronDenied;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Accept optional date/backfill params
    let dateParam = todayISO();
    let dateEnd: string | null = null;
    try {
      const body = await req.json();
      if (body?.date) dateParam = body.date;
      if (body?.date_end) dateEnd = body.date_end;
    } catch { /* no body = use today */ }

    const actorId = "notabotpromise/espn-scoreboard-monitor";

    const input: Record<string, unknown> = {
      nba_enabled: true,
      nba_state: "auto",
      nhl_enabled: true,
      nhl_state: "auto",
      mlb_enabled: true,
      mlb_state: "auto",
      nfl_enabled: true,
      nfl_state: "auto",
    };

    // Use date range or single date
    if (dateEnd) {
      input.nba_date_start = dateParam;
      input.nba_date_end = dateEnd;
      input.nhl_date_start = dateParam;
      input.nhl_date_end = dateEnd;
      input.mlb_date_start = dateParam;
      input.mlb_date_end = dateEnd;
      input.nfl_date_start = dateParam;
      input.nfl_date_end = dateEnd;
    } else {
      input.nba_date = dateParam;
      input.nhl_date = dateParam;
      input.mlb_date = dateParam;
      input.nfl_date = dateParam;
    }

    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}&format=json`;

    console.log(`[sync-scoreboard] Running for date: ${dateParam}`);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[sync-scoreboard] Apify failed:", err);
      return new Response(JSON.stringify({ error: "Apify failed", detail: err }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = await res.json();

    // Log raw
    await supabase.from("apify_raw_logs").insert({
      actor_id: actorId,
      input_json: input,
      payload: items,
      items_count: Array.isArray(items) ? items.length : 0,
    });

    // Normalize ESPN output → upsert into existing `games` table
    const gameUpserts: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    // The ESPN Scoreboard Monitor actor returns a flat array of event objects
    // Each has: home, away, league, event_id, state, start_time, matchup, etc.
    const allEvents: Record<string, any>[] = Array.isArray(items) ? items : [];

    for (const e of allEvents) {
      // Extract league (actor returns lowercase like "nba")
      let league = (e.league ?? e._league ?? e.sport ?? "").toString().toUpperCase();
      if (!league || league === "UNKNOWN") league = "NBA";

      // The actor provides home/away as top-level objects
      const home = e.home;
      const away = e.away;

      // Also handle nested competitions format as fallback
      const competitors = e.competitions?.[0]?.competitors ?? e.competitors ?? [];
      const homeComp = competitors.find((c: any) => c.homeAway === "home" || c.home_away === "home") ?? competitors[0];
      const awayComp = competitors.find((c: any) => c.homeAway === "away" || c.home_away === "away") ?? competitors[1];

      const homeAbbr = normalizeAbbr(league, home?.abbreviation ?? homeComp?.team?.abbreviation ?? homeComp?.abbreviation ?? "");
      const awayAbbr = normalizeAbbr(league, away?.abbreviation ?? awayComp?.team?.abbreviation ?? awayComp?.abbreviation ?? "");
      const homeName = home?.name ?? homeComp?.team?.displayName ?? homeComp?.displayName ?? homeAbbr;
      const awayName = away?.name ?? awayComp?.team?.displayName ?? awayComp?.displayName ?? awayAbbr;

      if (!homeAbbr || !awayAbbr) continue;

      // Status mapping — actor uses "state" field: "pre", "in", "post"
      const stateStr = (e.state ?? e.state_filter ?? e.status?.type?.state ?? "").toString().toLowerCase();
      const mappedStatus =
        stateStr.includes("post") || stateStr.includes("final") ? "final" :
        stateStr.includes("in") || stateStr.includes("live") || stateStr.includes("progress") ? "live" :
        "scheduled";

      // Scores — actor uses score_value or score
      const homeScore = Number(home?.score_value ?? home?.score ?? homeComp?.score ?? 0);
      const awayScore = Number(away?.score_value ?? away?.score ?? awayComp?.score ?? 0);

      // Start time — actor uses start_time.utc or start_time.local
      const startTime = e.start_time?.utc ?? e.start_time?.local ?? e.date ?? e.competitions?.[0]?.date ?? null;

      // External ID — actor uses event_id
      const externalId = String(e.event_id ?? e.id ?? e.uid ?? "");

      // Venue
      const venue = e.venue?.fullName ?? e.competitions?.[0]?.venue?.fullName ?? null;
      const venueLat = e.venue?.address?.latitude ?? e.competitions?.[0]?.venue?.address?.latitude ?? null;
      const venueLng = e.venue?.address?.longitude ?? e.competitions?.[0]?.venue?.address?.longitude ?? null;

      // Current period (quarter) — try multiple ESPN field paths
      const currentPeriod: number =
        Number(e.period ?? e.competitions?.[0]?.status?.period ?? e.status?.period ?? 0);

      // Current clock — "10:45", "0:00", etc.
      const currentClock: string | null =
        e.clock ?? e.status?.displayClock ?? e.competitions?.[0]?.status?.displayClock ?? null;

      // Per-quarter linescores — ESPN provides these as arrays of score values
      // Flat actor format: home.linescores = [{displayValue:"28"}, ...]
      // Competitors format: competitions[0].competitors[i].linescores = [{displayValue:"28"}, ...]
      const homeLinescores: number[] = (
        home?.linescores ?? home?.line_scores ?? homeComp?.linescores ?? []
      ).map((s: any) => Number(s?.displayValue ?? s?.value ?? s ?? 0)).filter(Number.isFinite);

      const awayLinescores: number[] = (
        away?.linescores ?? away?.line_scores ?? awayComp?.linescores ?? []
      ).map((s: any) => Number(s?.displayValue ?? s?.value ?? s ?? 0)).filter(Number.isFinite);

      gameUpserts.push({
        league,
        home_abbr: homeAbbr,
        away_abbr: awayAbbr,
        home_team: homeName,
        away_team: awayName,
        home_score: mappedStatus !== "scheduled" && Number.isFinite(homeScore) ? homeScore : null,
        away_score: mappedStatus !== "scheduled" && Number.isFinite(awayScore) ? awayScore : null,
        status: mappedStatus,
        start_time: startTime,
        external_id: externalId || null,
        venue,
        venue_lat: venueLat ? Number(venueLat) : null,
        venue_lng: venueLng ? Number(venueLng) : null,
        source: "espn_apify",
        updated_at: now,
        // Extra fields used after upsert to write quarter data — NOT stored in games table
        _currentPeriod: currentPeriod,
        _currentClock: currentClock,
        _homeLinescores: homeLinescores,
        _awayLinescores: awayLinescores,
        _mappedStatus: mappedStatus,
        _homeScore: homeScore,
        _awayScore: awayScore,
      });
    }

    // Upsert games using external_id to avoid duplicates
    // IMPORTANT: never overwrite non-null scores/status with null values
    let upserted = 0;
    let snapshots = 0;
    let quarterRows = 0;

    for (const g of gameUpserts) {
      // Strip private metadata fields before writing to games table
      const { _currentPeriod, _currentClock, _homeLinescores, _awayLinescores, _mappedStatus, _homeScore, _awayScore, ...gameRow } = g as any;

      let existing: { id: string; status: string; home_score: number | null } | null = null;

      if (gameRow.external_id) {
        const { data } = await supabase
          .from("games")
          .select("id, status, home_score")
          .eq("external_id", gameRow.external_id as string)
          .maybeSingle();
        existing = data;
      }

      if (!existing) {
        // Match by league + teams + date
        const startDate = gameRow.start_time ? (gameRow.start_time as string).split("T")[0] : null;
        if (startDate) {
          const { data } = await supabase
            .from("games")
            .select("id, status, home_score")
            .eq("league", gameRow.league as string)
            .eq("home_abbr", gameRow.home_abbr as string)
            .eq("away_abbr", gameRow.away_abbr as string)
            .gte("start_time", `${startDate}T00:00:00Z`)
            .lte("start_time", `${startDate}T23:59:59Z`)
            .maybeSingle();
          existing = data;
        }
      }

      let gameId: string | null = null;

      if (existing) {
        gameId = existing.id;
        // Build safe update: never regress status or clear scores
        const safeUpdate: Record<string, unknown> = { ...gameRow };
        const existingIsActive = existing.status === "live" || existing.status === "final";
        const incomingIsScheduled = gameRow.status === "scheduled";

        // Don't overwrite live/final status with scheduled
        if (existingIsActive && incomingIsScheduled) {
          delete safeUpdate.status;
        }
        // Don't clear scores if they already exist
        if (existing.home_score != null && gameRow.home_score == null) {
          delete safeUpdate.home_score;
          delete safeUpdate.away_score;
        }

        await supabase.from("games").update(safeUpdate).eq("id", existing.id);
      } else if (gameRow.start_time) {
        const { data: inserted } = await supabase.from("games").insert(gameRow).select("id").maybeSingle();
        gameId = inserted?.id ?? null;
      }
      upserted++;

      // ── Write quarter data for live/final games ──────────────────────────
      if (!gameId || _mappedStatus === "scheduled") continue;

      // 1. game_state_snapshots: current score + period (fallback for burst loop)
      //    Only write if we have a real score to avoid polluting with zeros
      if (_mappedStatus === "live" && _currentPeriod > 0 && (_homeScore > 0 || _awayScore > 0)) {
        await supabase.from("game_state_snapshots").insert({
          game_id: gameId,
          status: _mappedStatus,
          home_score: _homeScore,
          away_score: _awayScore,
          quarter: String(_currentPeriod),
          clock: _currentClock ?? null,
        });
        snapshots++;
      }

      // 2. game_quarters: per-quarter breakdown from ESPN linescores
      //    ESPN provides these for completed + in-progress games
      if (_homeLinescores.length > 0) {
        const numPeriods = Math.max(_homeLinescores.length, _awayLinescores.length);
        for (let i = 0; i < numPeriods; i++) {
          const qNum = i + 1;
          const hScore = _homeLinescores[i] ?? null;
          const aScore = _awayLinescores[i] ?? null;
          if (hScore == null && aScore == null) continue;
          await supabase.from("game_quarters").upsert(
            { game_id: gameId, quarter: qNum, home_score: hScore, away_score: aScore },
            { onConflict: "game_id,quarter" }
          );
          quarterRows++;
        }
      }
    }

    console.log(`[sync-scoreboard] Processed ${allEvents.length} events, upserted ${upserted} games, ${snapshots} snapshots, ${quarterRows} quarter rows`);

    return new Response(JSON.stringify({ ok: true, events: allEvents.length, upserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-scoreboard] Error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
