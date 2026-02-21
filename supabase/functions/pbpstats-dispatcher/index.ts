// PBPStats Dispatcher
// Checks for active/imminent NBA games, then triggers the pbpstats ingest pipeline.
// Intended to run every 1-2 minutes via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    // Check if any NBA games are live or starting within 6 hours
    const { data: activeGames, error } = await supabase
      .from("games")
      .select("id, status, start_time, home_abbr, away_abbr")
      .eq("league", "NBA")
      .or(
        `status.eq.live,and(status.eq.scheduled,start_time.lte.${sixHoursFromNow.toISOString()},start_time.gte.${now.toISOString()})`
      );

    if (error) {
      console.error("[pbpstats-dispatcher] Query error:", error.message);
      throw error;
    }

    const liveGames = (activeGames || []).filter((g) => g.status === "live");
    const upcomingGames = (activeGames || []).filter((g) => g.status === "scheduled");

    if (liveGames.length === 0 && upcomingGames.length === 0) {
      console.log("[pbpstats-dispatcher] No active/upcoming NBA games — skipping");
      return new Response(
        JSON.stringify({
          success: true,
          dispatched: false,
          live_count: 0,
          upcoming_count: 0,
          latency_ms: Date.now() - t0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[pbpstats-dispatcher] ${liveGames.length} live, ${upcomingGames.length} upcoming NBA games`
    );

    const results: Record<string, any> = {};
    const callHeaders = {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    };

    // Step 1: Ingest live games list from pbpstats
    try {
      const gamesResp = await fetch(
        `${supabaseUrl}/functions/v1/pbpstats-live-games-ingest?league=nba`,
        { method: "GET", headers: callHeaders }
      );
      results.games_ingest = await gamesResp.json();
    } catch (e) {
      results.games_ingest = { error: e.message };
    }

    // Step 2: Ingest play-by-play events for live games
    try {
      const pbpResp = await fetch(
        `${supabaseUrl}/functions/v1/pbpstats-live-pbp-ingest?league=nba`,
        { method: "GET", headers: callHeaders }
      );
      results.pbp_ingest = await pbpResp.json();
    } catch (e) {
      results.pbp_ingest = { error: e.message };
    }

    // Step 3: Rollup quarter stats for each live game's game_key
    if (liveGames.length > 0) {
      const rollupResults: any[] = [];
      // Get game_keys for live games from cosmic_game_id_map
      const liveAbbrs = liveGames.map(
        (g) => `${g.start_time?.slice(0, 10)}_${g.away_abbr}_${g.home_abbr}`
      );

      const { data: mappedKeys } = await supabase
        .from("cosmic_games")
        .select("game_key")
        .in("game_key", liveAbbrs);

      const gameKeys = (mappedKeys || []).map((r) => r.game_key);

      for (const gk of gameKeys) {
        try {
          const rollupResp = await fetch(
            `${supabaseUrl}/functions/v1/pbpstats-rollup-quarter-stats?game_key=${encodeURIComponent(gk)}`,
            { method: "GET", headers: callHeaders }
          );
          rollupResults.push({ game_key: gk, ...(await rollupResp.json()) });
        } catch (e) {
          rollupResults.push({ game_key: gk, error: e.message });
        }
      }
      results.rollups = rollupResults;
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: true,
        live_count: liveGames.length,
        upcoming_count: upcomingGames.length,
        results,
        latency_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[pbpstats-dispatcher] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
