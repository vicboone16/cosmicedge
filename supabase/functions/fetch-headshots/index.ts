// TheSportsDB Player Headshots (replaces SportsDataIO)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE = "https://www.thesportsdb.com/api/v1/json";

const LEAGUE_SEARCH_NAMES: Record<string, string> = {
  NBA: "NBA", NFL: "NFL", NHL: "NHL", MLB: "MLB",
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("THESPORTSDB_API_KEY");
    if (!apiKey) throw new Error("THESPORTSDB_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let bodyParams: Record<string, any> = {};
    if (req.method === "POST") {
      try { bodyParams = await req.json(); } catch { /* no body */ }
    }
    const url = new URL(req.url);
    const league = ((bodyParams.league || url.searchParams.get("league") || "NBA") as string).toUpperCase();
    const startTeam = parseInt(bodyParams.start_team || url.searchParams.get("start_team") || "0");
    const maxTeams = parseInt(bodyParams.max_teams || url.searchParams.get("max_teams") || "8");

    if (!LEAGUE_SEARCH_NAMES[league]) {
      return new Response(JSON.stringify({ error: `Unsupported league: ${league}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: get all teams
    const teamsResp = await fetch(`${BASE}/${apiKey}/search_all_teams.php?l=${LEAGUE_SEARCH_NAMES[league]}`);
    if (!teamsResp.ok) throw new Error(`Teams fetch failed: ${teamsResp.status}`);
    const teamsData = await teamsResp.json();
    const teams: any[] = teamsData.teams || [];
    const totalTeams = teams.length;

    // Step 2: Pre-fetch all players for this league by name
    const { data: dbPlayers } = await supabase
      .from("players")
      .select("id, name, team, league")
      .eq("league", league);

    const playerByName = new Map<string, string>(); // normalized name → id
    for (const p of dbPlayers || []) {
      playerByName.set(p.name.toLowerCase().trim(), p.id);
    }

    // Step 3: Loop through team chunk
    const chunk = teams.slice(startTeam, startTeam + maxTeams);
    let totalUpdated = 0;
    let teamsProcessed = 0;

    for (const team of chunk) {
      if (teamsProcessed > 0 && teamsProcessed % 4 === 0) await delay(300);

      try {
        const rosterResp = await fetch(`${BASE}/${apiKey}/lookup_all_players.php?id=${team.idTeam}`);
        if (!rosterResp.ok) continue;
        const rosterData = await rosterResp.json();
        const players: any[] = rosterData.player || [];

        const updates: { id: string; headshot_url: string }[] = [];
        for (const p of players) {
          const photoUrl = p.strThumb || p.strCutout || null;
          if (!photoUrl) continue;
          const pid = playerByName.get((p.strPlayer || "").toLowerCase().trim());
          if (pid) updates.push({ id: pid, headshot_url: photoUrl });
        }

        // Batch update in parallel
        if (updates.length > 0) {
          const results = await Promise.all(
            updates.map(u =>
              supabase.from("players").update({ headshot_url: u.headshot_url } as any).eq("id", u.id)
            )
          );
          totalUpdated += results.filter((r: any) => !r.error).length;
        }

        teamsProcessed++;
        console.log(`${league} ${team.strTeam}: ${updates.length} headshots updated`);
      } catch (err: any) {
        console.error(`Error for team ${team.strTeam}:`, err.message);
      }
    }

    const nextStartTeam = startTeam + maxTeams;

    return new Response(
      JSON.stringify({
        success: true,
        league,
        teams_processed: teamsProcessed,
        total_teams: totalTeams,
        players_updated: totalUpdated,
        next_start_team: nextStartTeam < totalTeams ? nextStartTeam : null,
        fetched_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("fetch-headshots error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
