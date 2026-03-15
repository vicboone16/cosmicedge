import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: any[] = [];

    // Step 1: Read current state
    const { data: before, error: readErr } = await sb
      .from("players")
      .select("id, name, team")
      .eq("name", "Anthony Edwards")
      .eq("league", "NBA");

    results.push({ step: "read_before", data: before, error: readErr?.message });

    if (before?.length) {
      for (const row of before) {
        // Direct update by ID
        const { data: upd, error: updErr, count } = await sb
          .from("players")
          .update({ team: "MIN" })
          .eq("id", row.id)
          .select("id, name, team");

        results.push({
          step: "update_by_id",
          id: row.id,
          prev_team: row.team,
          result: upd,
          error: updErr?.message,
          count,
        });
      }
    }

    // Step 2: Read after
    const { data: after } = await sb
      .from("players")
      .select("id, name, team")
      .eq("name", "Anthony Edwards")
      .eq("league", "NBA");

    results.push({ step: "read_after", data: after });

    // Step 3: Fix all MIN players + backfill game_ids
    const minPlayers = [
      "Ayo Dosunmu", "Jaden McDaniels", "Naz Reid", "Rudy Gobert",
      "Julius Randle", "Donte DiVincenzo", "Ryan Nembhard", "AJ Johnson",
      "Terrence Shannon Jr.", "Jaylen Clark", "Julian Phillips",
      "Rocco Zikarsky", "Moussa Cisse", "Skylar Mays",
    ];

    for (const name of minPlayers) {
      const { data: rows } = await sb
        .from("players")
        .select("id, team")
        .eq("name", name)
        .eq("league", "NBA")
        .eq("team", "DAL");

      if (rows?.length) {
        for (const row of rows) {
          await sb.from("players").update({ team: "MIN" }).eq("id", row.id);
        }
        results.push({ fixed: name, count: rows.length });
      }
    }

    // Step 4: Backfill game_ids for bet_slip_picks
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw")
      .is("game_id", null);

    const gameIdFixes: string[] = [];

    if (nullPicks?.length) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: players } = await sb
        .from("players")
        .select("id, team")
        .in("id", playerIds as string[]);

      const teamMap: Record<string, string> = {};
      players?.forEach(p => { if (p.team) teamMap[p.id] = p.team; });

      const today = new Date().toISOString().slice(0, 10);
      const { data: todayGames } = await sb
        .from("games")
        .select("id, home_abbr, away_abbr, status")
        .gte("start_time", `${today}T00:00:00Z`)
        .lte("start_time", `${today}T23:59:59Z`);

      if (todayGames?.length) {
        for (const pick of nullPicks) {
          if (!pick.player_id) continue;
          const team = teamMap[pick.player_id];
          if (!team) { gameIdFixes.push(`⚠️ ${pick.player_name_raw}: no team found`); continue; }

          const liveGame = todayGames.find(g =>
            (g.home_abbr === team || g.away_abbr === team) &&
            (g.status === "live" || g.status === "in_progress")
          );
          const anyGame = liveGame || todayGames.find(g =>
            g.home_abbr === team || g.away_abbr === team
          );

          if (anyGame) {
            const { error: gErr } = await sb
              .from("bet_slip_picks")
              .update({ game_id: anyGame.id })
              .eq("id", pick.id);
            gameIdFixes.push(gErr
              ? `❌ ${pick.player_name_raw}: ${gErr.message}`
              : `✅ ${pick.player_name_raw} → ${anyGame.home_abbr}v${anyGame.away_abbr}`
            );
          } else {
            gameIdFixes.push(`⚠️ ${pick.player_name_raw} (${team}): no game today`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      diagnostics: results,
      game_id_fixes: gameIdFixes,
      null_picks: nullPicks?.length || 0,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
