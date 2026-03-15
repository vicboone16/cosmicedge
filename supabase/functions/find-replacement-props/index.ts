import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Phase 5: Find Replacement Props
 * 
 * Given a weak leg (player, stat_type, line, game_id), find alternative props
 * ranked by a weighted model:
 *   Hit Prob 35%, Edge 25%, Minutes Security 15%, Volatility 15%, Correlation Penalty 10%
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("authorization") || "";
    const client = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await client.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { weak_leg, existing_game_ids, existing_player_names, stat_type, line, direction } = body;

    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Find active games from today's slate
    const today = new Date().toISOString().split("T")[0];
    const { data: todayGames } = await sb
      .from("games")
      .select("id, home_abbr, away_abbr, status, start_time")
      .eq("league", "NBA")
      .gte("start_time", today + "T00:00:00Z")
      .lte("start_time", today + "T23:59:59Z")
      .in("status", ["scheduled", "live", "in_progress"]);

    if (!todayGames?.length) {
      return new Response(JSON.stringify({ ok: true, replacements: [], reason: "no_active_games" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gameIds = todayGames.map(g => g.id);

    // 2. Get nebula predictions for this stat type across all today's games
    const cleanStat = (stat_type || "points").replace(/^(q[1-4]|[12]h):/, "").toLowerCase();
    const { data: predictions } = await sb
      .from("nebula_prop_predictions")
      .select("id, player_name, player_id, game_id, prop_type, line, side, mu, sigma, p_over, edge_score, edge_score_v11, hit_l10, streak, odds, one_liner")
      .in("game_id", gameIds)
      .ilike("prop_type", `%${cleanStat}%`)
      .gte("edge_score_v11", 50)
      .order("edge_score_v11", { ascending: false })
      .limit(50);

    if (!predictions?.length) {
      return new Response(JSON.stringify({ ok: true, replacements: [], reason: "no_predictions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get live_prop_state for intelligence
    const predPlayerIds = [...new Set(predictions.map(p => p.player_id).filter(Boolean))];
    const { data: liveStates } = await sb
      .from("live_prop_state")
      .select("player_id, game_id, prop_type, hit_probability, live_edge, minutes_security_score, volatility, foul_risk_level, blowout_probability")
      .in("game_id", gameIds)
      .in("player_id", predPlayerIds);

    const liveMap = new Map<string, any>();
    for (const ls of (liveStates || [])) {
      liveMap.set(`${ls.player_id}:${ls.prop_type}`, ls);
    }

    // 4. Filter out existing players and score replacements
    const existingNames = new Set((existing_player_names || []).map((n: string) => n.toLowerCase()));
    const existingGames = new Set(existing_game_ids || []);

    const scored = predictions
      .filter(p => !existingNames.has((p.player_name || "").toLowerCase()))
      .map(p => {
        const ls = liveMap.get(`${p.player_id}:${p.prop_type}`) || {};
        const hitProb = ls.hit_probability ?? (p.p_over ?? 0.5);
        const edge = ls.live_edge ?? (p.edge_score_v11 ?? p.edge_score ?? 50) / 10;
        const minSec = ls.minutes_security_score ?? 70;
        const vol = ls.volatility ?? 30;
        const corrPenalty = existingGames.has(p.game_id) ? 15 : 0;

        // Weighted composite score
        const score = 
          hitProb * 35 +
          Math.min(edge / 20, 1) * 25 +
          (minSec / 100) * 15 +
          ((100 - vol) / 100) * 15 -
          corrPenalty * 0.10;

        const tag = vol < 25 ? "lower_volatility" 
          : edge > 8 ? "stronger_edge"
          : hitProb > 0.65 ? "safer"
          : corrPenalty === 0 ? "better_matchup"
          : "stronger_signal";

        return {
          player_name: p.player_name,
          player_id: p.player_id,
          game_id: p.game_id,
          prop_type: p.prop_type,
          line: p.line,
          side: p.side || direction || "over",
          mu: p.mu,
          sigma: p.sigma,
          edge_score: p.edge_score_v11 ?? p.edge_score,
          hit_probability: Math.round(hitProb * 100),
          live_edge: Math.round((edge) * 10) / 10,
          minutes_security: Math.round(minSec),
          volatility: Math.round(vol),
          correlation_penalty: corrPenalty,
          composite_score: Math.round(score * 10) / 10,
          tag,
          one_liner: p.one_liner,
          odds: p.odds,
          hit_l10: p.hit_l10,
          streak: p.streak,
        };
      })
      .sort((a, b) => b.composite_score - a.composite_score)
      .slice(0, 5);

    return new Response(JSON.stringify({ ok: true, replacements: scored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("find-replacement-props error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
