import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sportsDataKey = Deno.env.get("SPORTSDATAIO_API_KEY");

    if (!sportsDataKey) {
      return new Response(JSON.stringify({ error: "SPORTSDATAIO_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get today's date in YYYY-MMM-DD format for SportsData.io
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);

    // Fetch games that are live or scheduled for today
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, external_id, status, home_team, away_team")
      .or(`status.eq.live,and(status.eq.scheduled,start_time.gte.${todayISO}T00:00:00Z,start_time.lte.${todayISO}T23:59:59Z)`)
      .not("external_id", "is", null);

    if (gamesError) {
      throw new Error("Failed to fetch games: " + gamesError.message);
    }

    if (!games || games.length === 0) {
      return new Response(JSON.stringify({ message: "No active games to update", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;

    for (const game of games) {
      try {
        // SportsData.io NBA Box Score endpoint
        const url = `https://api.sportsdata.io/v3/nba/scores/json/BoxScore/${game.external_id}?key=${sportsDataKey}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`SportsData.io error for game ${game.external_id}: ${resp.status}`);
          await resp.text(); // consume body
          continue;
        }

        const boxScore = await resp.json();
        const g = boxScore?.Game;
        if (!g) continue;

        // Map SportsData.io status
        let mappedStatus = game.status;
        if (g.Status === "InProgress") mappedStatus = "live";
        else if (g.Status === "Final" || g.Status === "F/OT") mappedStatus = "final";
        else if (g.Status === "Scheduled" || g.Status === "Pregame") mappedStatus = "scheduled";

        const homeScore = g.HomeTeamScore ?? null;
        const awayScore = g.AwayTeamScore ?? null;
        const quarter = g.Quarter ? String(g.Quarter) : null;
        const clock = g.TimeRemainingMinutes != null && g.TimeRemainingSeconds != null
          ? `${g.TimeRemainingMinutes}:${String(g.TimeRemainingSeconds).padStart(2, "0")}`
          : null;

        // Upsert snapshot
        await supabase.from("game_state_snapshots").insert({
          game_id: game.id,
          status: mappedStatus,
          home_score: homeScore,
          away_score: awayScore,
          quarter,
          clock,
        });

        // Update games table
        await supabase
          .from("games")
          .update({
            home_score: homeScore,
            away_score: awayScore,
            status: mappedStatus,
          })
          .eq("id", game.id);

        updatedCount++;
      } catch (e) {
        console.error(`Error processing game ${game.external_id}:`, e);
      }
    }

    return new Response(JSON.stringify({ message: "Live scores updated", updated: updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-live-scores error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
