import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Unmatched games
    const { data: unmatched } = await supabase
      .from("cosmic_unmatched_games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // Recent mapping decisions
    const { data: recentMappings } = await supabase
      .from("cosmic_game_id_map")
      .select("provider, provider_game_id, league, game_key, confidence, match_method, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    // Live games count
    const { count: liveCount } = await supabase
      .from("pbp_live_games_by_provider")
      .select("*", { count: "exact", head: true });

    // Canonical games count
    const { count: cosmicCount } = await supabase
      .from("cosmic_games")
      .select("*", { count: "exact", head: true });

    // Recent events count
    const { count: eventsCount } = await supabase
      .from("pbp_events")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        write_mode: Deno.env.get("WRITE_MODE") ?? "dry_run",
        pbpstats_enabled: Deno.env.get("PBPSTATS_ENABLED") ?? "true",
        cosmic_games_total: cosmicCount,
        live_games_total: liveCount,
        pbp_events_total: eventsCount,
        unmatched_games: unmatched || [],
        recent_mappings: recentMappings || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[pbpstats-diagnostics] Error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
