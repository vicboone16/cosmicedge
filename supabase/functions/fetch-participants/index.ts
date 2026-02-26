// fetch-participants — Player/roster sync using SGO v2
// SGO events include player data via odds (statEntityID), so we extract from events
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGO_BASE = "https://api.sportsgameodds.com/v2";

function formatPlayerName(playerId: string): string {
  if (!playerId) return "";
  const parts = playerId.split("_");
  // Remove trailing number + league suffix (e.g. "LEBRON_JAMES_1_NBA" → "Lebron James")
  if (parts.length > 2) {
    const nameParts = parts.slice(0, -2);
    return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  }
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function sgoTeamToAbbr(league: string, teamID: string): string | null {
  // teamID format: "LOS_ANGELES_LAKERS_NBA" → "Los Angeles Lakers"
  const cleanName = teamID.replace(/_NBA$|_NFL$|_MLB$|_NHL$|_NCAAB$|_NCAAF$/i, "")
    .split("_").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  
  const dict = CANONICAL[league];
  if (!dict) return null;
  
  // Direct lookup
  if (dict[cleanName]) return dict[cleanName];
  
  // Case-insensitive lookup
  for (const [name, abbr] of Object.entries(dict)) {
    if (name.toLowerCase() === cleanName.toLowerCase()) return abbr;
  }
  return null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url: string, apiKey: string, maxRetries = 2): Promise<any | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (resp.status === 429) {
      const wait = Math.min(parseInt(resp.headers.get("retry-after") || "5", 10) * 1000, 15000);
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

    // Fetch upcoming events with odds (which contain player statEntityIDs)
    const eventsUrl = `${SGO_BASE}/events?leagueID=${league}&oddsAvailable=true&finalized=false&limit=50`;
    const json = await fetchWithRetry(eventsUrl, apiKey);

    if (!json?.data?.length) {
      return new Response(
        JSON.stringify({ success: true, league, players_upserted: 0, message: "No events with odds found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = json.data;
    const playersSeen = new Map<string, { name: string; team: string; league: string }>();

    for (const event of events) {
      const homeTeamID = event.teams?.home?.teamID || "";
      const awayTeamID = event.teams?.away?.teamID || "";
      const homeAbbr = sgoTeamToAbbr(league, homeTeamID);
      const awayAbbr = sgoTeamToAbbr(league, awayTeamID);

      const odds = event.odds || {};
      for (const [, oddData] of Object.entries(odds) as [string, any][]) {
        const statEntityID = oddData.statEntityID || "all";
        if (statEntityID === "all" || statEntityID === "home" || statEntityID === "away") continue;

        const playerName = formatPlayerName(statEntityID);
        if (!playerName || playersSeen.has(playerName)) continue;

        // Determine team from the sideID or statEntityID suffix
        const sideID = oddData.sideID || "";
        let teamAbbr: string | null = null;
        if (sideID === "home" && homeAbbr) teamAbbr = homeAbbr;
        else if (sideID === "away" && awayAbbr) teamAbbr = awayAbbr;
        else {
          // Try to infer from ID suffix — e.g. statEntityID contains team in some formats
          teamAbbr = homeAbbr || awayAbbr || null;
        }

        if (teamAbbr) {
          playersSeen.set(playerName, { name: playerName, team: teamAbbr, league });
        }
      }
    }

    let playersUpserted = 0;
    const skippedPlayers: string[] = [];

    for (const [, record] of playersSeen) {
      if (!record.name) continue;

      // Check if player already exists by name (any team) — NEVER overwrite team assignments
      const { data: existingByName } = await supabase.from("players").select("id, team")
        .eq("name", record.name).eq("league", record.league).maybeSingle();

      if (existingByName) {
        // Player exists — do NOT update team. Team assignments are manually curated.
        playersUpserted++;
        continue;
      }

      // Only insert truly new players
      const { error } = await supabase.from("players").insert({
        name: record.name, team: record.team, league: record.league,
        external_id: `sgo_${record.name.replace(/\s+/g, "_").toLowerCase()}`,
      });
      if (error && !error.message.includes("duplicate")) {
        console.error(`Insert error for ${record.name}:`, error.message);
        skippedPlayers.push(record.name);
        continue;
      }
      playersUpserted++;
    }

    return new Response(
      JSON.stringify({
        success: true, league,
        events_scanned: events.length,
        players_upserted: playersUpserted,
        skipped_players: skippedPlayers,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-participants error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
