// fetch-historical-odds — Historical odds using SGO v2
// Uses SGO's startsAfter/startsBefore params to fetch past events with odds
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";
const LEAGUE_MAP: Record<string, string> = {
  NBA: "NBA", NFL: "NFL", MLB: "MLB", NHL: "NHL",
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url: string, apiKey: string, maxRetries = 2): Promise<any | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (resp.status === 429) {
      const wait = Math.min(parseInt(resp.headers.get("retry-after") || "5", 10) * 1000, 15000);
      console.warn(`SGO 429 — waiting ${wait}ms (attempt ${attempt + 1})`);
      await delay(wait);
      continue;
    }
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`SGO error ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }
    return await resp.json();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SPORTSGAMEODDS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SPORTSGAMEODDS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const dateParam = url.searchParams.get("date"); // ISO: 2024-01-15T00:00:00Z

    const sgoLeague = LEAGUE_MAP[league];
    if (!sgoLeague) {
      return new Response(JSON.stringify({ error: `Unsupported league: ${league}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!dateParam) {
      return new Response(JSON.stringify({ error: "date parameter required (ISO format)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const snapshotDate = dateParam.split("T")[0];
    const dayStart = `${snapshotDate}T00:00:00Z`;
    const dayEnd = `${snapshotDate}T23:59:59Z`;

    // Fetch finalized events for that date from SGO
    const eventsUrl = `${SGO_BASE}/events?leagueID=${sgoLeague}&startsAfter=${dayStart}&startsBefore=${dayEnd}&finalized=true&limit=50`;
    const json = await fetchWithRetry(eventsUrl, apiKey);

    if (!json?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, events_found: 0, odds_stored: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = json.data;
    console.log(`[Historical] Found ${events.length} events for ${league} on ${snapshotDate}`);

    const rows: any[] = [];

    for (const event of events) {
      const homeTeamID = event.teams?.home?.teamID || "";
      const awayTeamID = event.teams?.away?.teamID || "";
      const homeTeam = event.teams?.home?.names?.long || event.teams?.home?.names?.medium || homeTeamID;
      const awayTeam = event.teams?.away?.names?.long || event.teams?.away?.names?.medium || awayTeamID;
      const eventId = event.eventID || "";
      const startTime = event.status?.startsAt || dateParam;

      // Try to match to existing game
      const { data: gameMatch } = await supabase
        .from("games").select("id").eq("external_id", `sgo_${eventId}`).maybeSingle();

      const odds = event.odds || {};
      for (const [oddID, oddData] of Object.entries(odds) as [string, any][]) {
        let marketType = "unknown";
        let homePrice: number | null = null;
        let awayPrice: number | null = null;
        let line: number | null = null;

        if (oddID.includes("-ml-home")) { marketType = "moneyline"; homePrice = oddData.odds ?? null; }
        else if (oddID.includes("-ml-away")) { marketType = "moneyline"; awayPrice = oddData.odds ?? null; }
        else if (oddID.includes("-sp-home")) { marketType = "spread"; homePrice = oddData.odds ?? null; line = oddData.spread ?? null; }
        else if (oddID.includes("-sp-away")) { marketType = "spread"; awayPrice = oddData.odds ?? null; line = oddData.spread ?? null; }
        else if (oddID.includes("-ou-over")) { marketType = "total"; homePrice = oddData.odds ?? null; line = oddData.overUnder ?? null; }
        else if (oddID.includes("-ou-under")) { marketType = "total"; awayPrice = oddData.odds ?? null; line = oddData.overUnder ?? null; }
        else continue;

        // Consensus row
        rows.push({
          game_id: gameMatch?.id || null,
          external_event_id: `sgo_${eventId}`,
          league, home_team: homeTeam, away_team: awayTeam,
          start_time: startTime, market_type: marketType,
          bookmaker: "sgo_consensus",
          home_price: homePrice != null ? Math.round(Number(homePrice)) : null,
          away_price: awayPrice != null ? Math.round(Number(awayPrice)) : null,
          line: line != null ? Number(line) : null,
          snapshot_date: snapshotDate,
        });

        // Per-bookmaker rows
        if (oddData.byBookmaker) {
          for (const [bkId, bkData] of Object.entries(oddData.byBookmaker) as [string, any][]) {
            rows.push({
              game_id: gameMatch?.id || null,
              external_event_id: `sgo_${eventId}`,
              league, home_team: homeTeam, away_team: awayTeam,
              start_time: startTime, market_type: marketType,
              bookmaker: `sgo_${bkId}`,
              home_price: (oddID.includes("home") || oddID.includes("over")) ? (bkData.odds != null ? Math.round(Number(bkData.odds)) : null) : null,
              away_price: (oddID.includes("away") || oddID.includes("under")) ? (bkData.odds != null ? Math.round(Number(bkData.odds)) : null) : null,
              line: bkData.spread ?? bkData.overUnder ?? (line != null ? Number(line) : null),
              snapshot_date: snapshotDate,
            });
          }
        }
      }
    }

    // Delete existing + batch insert
    let storedCount = 0;
    await supabase.from("historical_odds").delete().eq("league", league).eq("snapshot_date", snapshotDate);

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from("historical_odds").insert(chunk);
      if (error) console.error(`Historical odds insert error at offset ${i}:`, error.message);
      else storedCount += chunk.length;
    }

    return new Response(
      JSON.stringify({ success: true, league, snapshot_date: snapshotDate, events_found: events.length, odds_stored: storedCount, bookmakers_seen: rows.length, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-historical-odds error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
