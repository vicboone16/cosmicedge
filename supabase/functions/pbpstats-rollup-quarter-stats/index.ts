import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    const writeMode = Deno.env.get("WRITE_MODE") ?? "dry_run";

    const url = new URL(req.url);
    const gameKey = url.searchParams.get("game_key");
    if (!gameKey) {
      return new Response(JSON.stringify({ error: "game_key required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all events for this game from pbpstats provider
    const { data: events, error: evErr } = await supabase
      .from("pbp_events")
      .select("*")
      .eq("game_key", gameKey)
      .eq("provider", "pbpstats")
      .order("period", { ascending: true })
      .order("created_at", { ascending: true });

    if (evErr) throw new Error(`Fetch events: ${evErr.message}`);
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No events to rollup", game_key: gameKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build team stats and player stats from events
    const teamStats: Record<string, any> = {}; // key: `${period}|${team_abbr}`
    const playerStats: Record<string, any> = {}; // key: `${period}|${player_id}`

    for (const ev of events) {
      if (!ev.team_abbr) continue;
      const tKey = `${ev.period}|${ev.team_abbr}`;
      if (!teamStats[tKey]) {
        teamStats[tKey] = {
          game_key: gameKey,
          provider: "pbpstats",
          period: ev.period,
          team_abbr: ev.team_abbr,
          pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
          ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, fouls: 0,
          last_provider_event_id: null,
        };
      }

      const ts = teamStats[tKey];
      ts.last_provider_event_id = ev.provider_event_id;

      // Parse event_type or description to accumulate stats
      const et = (ev.event_type || "").toLowerCase();
      const desc = (ev.description || "").toLowerCase();

      if (et.includes("field goal") || et.includes("shot") || desc.includes("makes")) {
        if (desc.includes("miss") || et.includes("miss")) {
          ts.fga++;
          if (desc.includes("3-point") || desc.includes("3pt") || et.includes("3pt")) {
            ts.fg3a++;
          }
        } else {
          ts.fga++;
          ts.fgm++;
          // Determine points
          if (desc.includes("3-point") || desc.includes("3pt") || et.includes("3pt")) {
            ts.fg3a++;
            ts.fg3m++;
            ts.pts += 3;
          } else {
            ts.pts += 2;
          }
        }
      } else if (et.includes("free throw") || desc.includes("free throw")) {
        ts.fta++;
        if (!desc.includes("miss") && !et.includes("miss")) {
          ts.ftm++;
          ts.pts += 1;
        }
      } else if (et.includes("turnover") || desc.includes("turnover")) {
        ts.tov++;
      } else if (et.includes("rebound") || desc.includes("rebound")) {
        if (desc.includes("offensive") || et.includes("offensive")) {
          ts.oreb++;
        } else {
          ts.dreb++;
        }
      } else if (et.includes("foul") || desc.includes("foul")) {
        ts.fouls++;
      }

      // Player stats
      if (ev.player_id) {
        const pKey = `${ev.period}|${ev.player_id}`;
        if (!playerStats[pKey]) {
          playerStats[pKey] = {
            game_key: gameKey,
            provider: "pbpstats",
            period: ev.period,
            team_abbr: ev.team_abbr,
            player_id: ev.player_id,
            player_name: ev.player_name || "Unknown",
            pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
            ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
            last_provider_event_id: null,
          };
        }
        const ps = playerStats[pKey];
        ps.last_provider_event_id = ev.provider_event_id;

        if (et.includes("field goal") || et.includes("shot") || desc.includes("makes")) {
          if (desc.includes("miss") || et.includes("miss")) {
            ps.fga++;
            if (desc.includes("3-point") || desc.includes("3pt")) { ps.fg3a++; }
          } else {
            ps.fga++; ps.fgm++;
            if (desc.includes("3-point") || desc.includes("3pt")) {
              ps.fg3a++; ps.fg3m++; ps.pts += 3;
            } else {
              ps.pts += 2;
            }
          }
        } else if (et.includes("free throw") || desc.includes("free throw")) {
          ps.fta++;
          if (!desc.includes("miss") && !et.includes("miss")) { ps.ftm++; ps.pts += 1; }
        } else if (et.includes("assist") || desc.includes("assist")) { ps.ast++; }
        else if (et.includes("steal") || desc.includes("steal")) { ps.stl++; }
        else if (et.includes("block") || desc.includes("block")) { ps.blk++; }
        else if (et.includes("turnover") || desc.includes("turnover")) { ps.tov++; }
        else if (et.includes("rebound") || desc.includes("rebound")) { ps.reb++; }
        else if (et.includes("foul") || desc.includes("foul")) { ps.pf++; }
      }
    }

    let teamUpserts = 0;
    let playerUpserts = 0;

    if (writeMode !== "dry_run") {
      // Upsert team stats
      const teamRows = Object.values(teamStats).map((t: any) => ({
        ...t,
        updated_at: new Date().toISOString(),
      }));
      if (teamRows.length > 0) {
        const { error } = await supabase
          .from("pbp_quarter_team_stats")
          .upsert(teamRows, { onConflict: "game_key,provider,period,team_abbr" });
        if (error) console.error("[rollup] team upsert error:", error.message);
        else teamUpserts = teamRows.length;
      }

      // Upsert player stats
      const playerRows = Object.values(playerStats).map((p: any) => ({
        ...p,
        updated_at: new Date().toISOString(),
      }));
      if (playerRows.length > 0) {
        const { error } = await supabase
          .from("pbp_quarter_player_stats")
          .upsert(playerRows, { onConflict: "game_key,provider,period,player_id" });
        if (error) console.error("[rollup] player upsert error:", error.message);
        else playerUpserts = playerRows.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        write_mode: writeMode,
        game_key: gameKey,
        total_events: events.length,
        team_stats_rows: Object.keys(teamStats).length,
        player_stats_rows: Object.keys(playerStats).length,
        team_upserts: teamUpserts,
        player_upserts: playerUpserts,
        latency_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[rollup] Error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred.", latency_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
