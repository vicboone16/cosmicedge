// Smart SGO Dispatcher
// Checks which leagues have active/imminent games, then only polls those leagues.
// Runs every 1 minute via cron — skips off-season leagues entirely.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALL_LEAGUES = ["NBA", "NFL", "MLB", "NHL"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    // Find leagues that have live games OR games starting within 12 hours
    const { data: activeGames, error } = await supabase
      .from("games")
      .select("league, status, start_time")
      .or(`status.eq.live,and(status.eq.scheduled,start_time.lte.${twelveHoursFromNow.toISOString()},start_time.gte.${now.toISOString()})`)
      .in("league", ALL_LEAGUES);

    if (error) {
      console.error("Dispatcher query error:", error.message);
      throw error;
    }

    // Deduplicate leagues
    const activeLeagues = [...new Set((activeGames || []).map(g => g.league))];

    if (activeLeagues.length === 0) {
      console.log("[Dispatcher] No active leagues — skipping poll");
      return new Response(
        JSON.stringify({ success: true, active_leagues: [], dispatched: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[Dispatcher] Active leagues: ${activeLeagues.join(", ")}`);

    // Call fetch-sgo-live with only the active leagues
    const leagueParam = activeLeagues.join(",");
    const fetchUrl = `${supabaseUrl}/functions/v1/fetch-sgo-live?feed=events:live&league=${leagueParam}`;

    const resp = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
    });

    const result = await resp.json();
    console.log(`[Dispatcher] fetch-sgo-live result:`, JSON.stringify(result));

    return new Response(
      JSON.stringify({
        success: true,
        active_leagues: activeLeagues,
        skipped_leagues: ALL_LEAGUES.filter(l => !activeLeagues.includes(l)),
        dispatched: true,
        result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("sgo-dispatcher error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
