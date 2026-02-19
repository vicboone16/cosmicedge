import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

      const homeAbbr = home?.abbreviation ?? homeComp?.team?.abbreviation ?? homeComp?.abbreviation ?? "";
      const awayAbbr = away?.abbreviation ?? awayComp?.team?.abbreviation ?? awayComp?.abbreviation ?? "";
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
      });
    }

    // Upsert games using external_id to avoid duplicates
    let upserted = 0;
    for (const g of gameUpserts) {
      if (g.external_id) {
        // Check if game exists by external_id
        const { data: existing } = await supabase
          .from("games")
          .select("id")
          .eq("external_id", g.external_id as string)
          .maybeSingle();

        if (existing) {
          await supabase.from("games").update(g).eq("id", existing.id);
        } else {
          await supabase.from("games").insert(g);
        }
        upserted++;
      } else {
        // Match by league + teams + date
        const startDate = g.start_time ? (g.start_time as string).split("T")[0] : null;
        if (startDate) {
          const { data: existing } = await supabase
            .from("games")
            .select("id")
            .eq("league", g.league as string)
            .eq("home_abbr", g.home_abbr as string)
            .eq("away_abbr", g.away_abbr as string)
            .gte("start_time", `${startDate}T00:00:00Z`)
            .lte("start_time", `${startDate}T23:59:59Z`)
            .maybeSingle();

          if (existing) {
            await supabase.from("games").update(g).eq("id", existing.id);
          } else {
            await supabase.from("games").insert(g);
          }
          upserted++;
        }
      }
    }

    console.log(`[sync-scoreboard] Processed ${allEvents.length} events, upserted ${upserted} games`);

    return new Response(JSON.stringify({ ok: true, events: allEvents.length, upserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-scoreboard] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
