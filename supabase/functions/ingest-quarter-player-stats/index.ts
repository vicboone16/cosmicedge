import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Ingest quarterly player stats (Q1, Q2, Q3, Q4, 1H, 2H, OT, etc.)
 * into player_game_stats WITHOUT touching period='full' rows.
 *
 * POST body (JSON):
 * {
 *   "stats": [
 *     {
 *       "game_id": "uuid",
 *       "player_id": "uuid",
 *       "team_abbr": "BOS",
 *       "period": "Q1",          // REQUIRED: Q1, Q2, Q3, Q4, 1H, 2H, OT, OT2...
 *       "points": 8,
 *       "rebounds": 3,
 *       "assists": 2,
 *       "steals": 1,
 *       "blocks": 0,
 *       "turnovers": 1,
 *       "minutes": 12,
 *       "fg_made": 3,
 *       "fg_attempted": 7,
 *       "three_made": 1,
 *       "three_attempted": 3,
 *       "ft_made": 1,
 *       "ft_attempted": 2,
 *       "off_rebounds": 1,
 *       "def_rebounds": 2,
 *       "personal_fouls": 1
 *     }
 *   ]
 * }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const stats: any[] = body.stats;

    if (!Array.isArray(stats) || stats.length === 0) {
      return new Response(
        JSON.stringify({ error: "Request body must contain a non-empty 'stats' array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and filter: NEVER allow period='full'
    const ALLOWED_PERIODS = new Set([
      "Q1", "Q2", "Q3", "Q4",
      "1H", "2H",
      "OT", "OT2", "OT3", "OT4",
    ]);

    const rejected: any[] = [];
    const rows: any[] = [];

    for (const s of stats) {
      const period = (s.period || "").toUpperCase();

      if (!s.game_id || !s.player_id || !period) {
        rejected.push({ reason: "missing game_id, player_id, or period", input: s });
        continue;
      }

      if (period === "FULL") {
        rejected.push({ reason: "period='full' is protected — skipped", input: s });
        continue;
      }

      if (!ALLOWED_PERIODS.has(period)) {
        rejected.push({ reason: `unknown period '${period}'`, input: s });
        continue;
      }

      rows.push({
        game_id: s.game_id,
        player_id: s.player_id,
        team_abbr: s.team_abbr || null,
        period: period,
        points: s.points ?? 0,
        rebounds: s.rebounds ?? 0,
        assists: s.assists ?? 0,
        steals: s.steals ?? 0,
        blocks: s.blocks ?? 0,
        turnovers: s.turnovers ?? 0,
        minutes: s.minutes ?? 0,
        fg_made: s.fg_made ?? 0,
        fg_attempted: s.fg_attempted ?? 0,
        three_made: s.three_made ?? 0,
        three_attempted: s.three_attempted ?? 0,
        ft_made: s.ft_made ?? 0,
        ft_attempted: s.ft_attempted ?? 0,
        off_rebounds: s.off_rebounds ?? 0,
        def_rebounds: s.def_rebounds ?? 0,
        personal_fouls: s.personal_fouls ?? 0,
      });
    }

    let upserted = 0;
    let errors: string[] = [];

    if (rows.length > 0) {
      // Batch in chunks of 200
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("player_game_stats")
          .upsert(chunk, { onConflict: "game_id,player_id,period" });

        if (error) {
          console.error("[ingest-quarter-player-stats] upsert error:", error.message);
          errors.push(error.message);
        } else {
          upserted += chunk.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        upserted,
        rejected: rejected.length,
        rejected_details: rejected.length > 0 ? rejected : undefined,
        errors: errors.length > 0 ? errors : undefined,
        latency_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ingest-quarter-player-stats] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message, latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
