import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CANONICAL } from "../_shared/team-mappings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THE_ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const SPORT_KEYS: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NCAAB: "basketball_ncaab",
  NCAAF: "americanfootball_ncaaf",
};

function getAbbr(league: string, teamName: string): string | null {
  const dict = CANONICAL[league];
  if (!dict) return null;
  const abbr = dict[teamName];
  if (abbr) return abbr;
  // Try common variants (e.g. "LA Clippers" vs "Los Angeles Clippers")
  for (const [name, a] of Object.entries(dict)) {
    if (name.toLowerCase() === teamName.toLowerCase()) return a;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("THE_ODDS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "THE_ODDS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const sportKey = SPORT_KEYS[league];

    if (!sportKey) {
      return new Response(
        JSON.stringify({ error: `Unsupported league: ${league}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch participants (rosters) from The Odds API
    const participantsUrl = `${THE_ODDS_API_BASE}/sports/${sportKey}/participants?apiKey=${apiKey}`;
    const resp = await fetch(participantsUrl);

    if (!resp.ok) {
      const body = await resp.text();
      return new Response(
        JSON.stringify({ error: `Participants API error: ${resp.status}`, details: body.slice(0, 300) }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remaining = resp.headers.get("x-requests-remaining");
    const data = await resp.json();

    let playersUpserted = 0;
    let teamsProcessed = 0;
    let skippedTeams: string[] = [];
    const batchSize = 50;

    for (const team of data) {
      const teamName = team.name || "";
      const teamAbbr = getAbbr(league, teamName);
      
      if (!teamAbbr) {
        console.warn(`Unknown team name for ${league}: "${teamName}" — skipping`);
        skippedTeams.push(teamName);
        continue;
      }
      
      teamsProcessed++;

      const players = team.players || [];
      if (players.length === 0) continue;

      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);
        const records = batch.map((p: any) => ({
          name: p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          team: teamAbbr,
          league,
          position: p.position || null,
          external_id: p.id ? `oddsapi_${p.id}` : null,
        }));

        for (const record of records) {
          if (!record.name) continue;

          const { data: existing } = await supabase
            .from("players")
            .select("id")
            .eq("name", record.name)
            .eq("team", record.team)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("players")
              .update({ team: record.team, league: record.league, position: record.position })
              .eq("id", existing.id);
          } else {
            const { error } = await supabase.from("players").insert(record);
            if (error && !error.message.includes("duplicate")) {
              console.error(`Insert error for ${record.name}:`, error.message);
            }
          }
          playersUpserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        league,
        teams_processed: teamsProcessed,
        players_upserted: playersUpserted,
        skipped_teams: skippedTeams,
        api_remaining: remaining,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("fetch-participants error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
