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
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch all un-triggered alerts with their game data
    const { data: alerts, error } = await sb
      .from("alerts")
      .select("*, games!alerts_game_id_fkey(id, status, home_score, away_score, home_abbr, away_abbr)")
      .eq("triggered", false);

    if (error) throw new Error("Failed to fetch alerts: " + error.message);
    if (!alerts?.length) {
      return new Response(JSON.stringify({ message: "No pending alerts", triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let triggeredCount = 0;

    for (const alert of alerts) {
      const game = (alert as any).games;
      if (!game) continue;

      let shouldTrigger = false;
      let message = alert.message || "";

      switch (alert.alert_type) {
        case "game_final":
          if (game.status === "final") {
            shouldTrigger = true;
            message = `${game.away_abbr} @ ${game.home_abbr} is FINAL: ${game.away_score}-${game.home_score}`;
          }
          break;

        case "score_change":
          // Triggers whenever a live game has scores
          if (game.status === "live" && game.home_score != null) {
            shouldTrigger = true;
            message = `Score update: ${game.away_abbr} ${game.away_score} - ${game.home_abbr} ${game.home_score}`;
          }
          break;

        case "line_move":
          // Check if spread has moved past threshold
          if (alert.threshold != null) {
            const { data: latestOdds } = await sb
              .from("odds_snapshots")
              .select("line")
              .eq("game_id", game.id)
              .eq("market_type", "spread")
              .order("captured_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestOdds?.line != null && Math.abs(latestOdds.line) >= Math.abs(alert.threshold)) {
              shouldTrigger = true;
              message = `Spread moved to ${latestOdds.line} (threshold: ${alert.threshold})`;
            }
          }
          break;

        case "quarter_end":
          // Check game_state_snapshots for quarter changes
          if (game.status === "live") {
            const { data: snap } = await sb
              .from("game_state_snapshots")
              .select("quarter")
              .eq("game_id", game.id)
              .order("captured_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (snap?.quarter && alert.threshold != null && parseInt(snap.quarter) >= alert.threshold) {
              shouldTrigger = true;
              message = `Quarter ${snap.quarter} reached for ${game.away_abbr} @ ${game.home_abbr}`;
            }
          }
          break;

        case "prop_hit":
          // This would need player stat tracking - simplified version
          shouldTrigger = false;
          break;
      }

      if (shouldTrigger) {
        await sb.from("alerts").update({
          triggered: true,
          triggered_at: new Date().toISOString(),
          message,
        }).eq("id", alert.id);
        triggeredCount++;
      }
    }

    return new Response(JSON.stringify({
      message: "Alert check complete",
      checked: alerts.length,
      triggered: triggeredCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-alerts error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
