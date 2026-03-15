import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const fixes: { name: string; correct_team: string }[] = [
      // MIN players incorrectly on DAL
      { name: "Anthony Edwards", correct_team: "MIN" },
      { name: "Ayo Dosunmu", correct_team: "MIN" },
      { name: "Jaden McDaniels", correct_team: "MIN" },
      { name: "Naz Reid", correct_team: "MIN" },
      { name: "Rudy Gobert", correct_team: "MIN" },
      { name: "Julius Randle", correct_team: "MIN" },
      { name: "Donte DiVincenzo", correct_team: "MIN" },
      { name: "Ryan Nembhard", correct_team: "MIN" },
      { name: "AJ Johnson", correct_team: "MIN" },
      { name: "Terrence Shannon Jr.", correct_team: "MIN" },
      { name: "Jaylen Clark", correct_team: "MIN" },
      { name: "Julian Phillips", correct_team: "MIN" },
      { name: "Rocco Zikarsky", correct_team: "MIN" },
      { name: "Moussa Cisse", correct_team: "MIN" },
      { name: "Skylar Mays", correct_team: "MIN" },
    ];

    const results: string[] = [];

    for (const fix of fixes) {
      const { data, error } = await sb
        .from("players")
        .update({ team: fix.correct_team })
        .eq("name", fix.name)
        .eq("league", "NBA")
        .eq("team", "DAL");

      if (error) {
        results.push(`❌ ${fix.name}: ${error.message}`);
      } else {
        results.push(`✅ ${fix.name} → ${fix.correct_team}`);
      }
    }

    // Also backfill game_ids for bet_slip_picks that are NULL
    // Get all picks without game_id
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw, slip_id")
      .is("game_id", null);

    const gameIdResults: string[] = [];

    if (nullPicks?.length) {
      // Get player teams
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: players } = await sb
        .from("players")
        .select("id, team")
        .in("id", playerIds);

      const teamMap: Record<string, string> = {};
      players?.forEach(p => { if (p.team) teamMap[p.id] = p.team; });

      // Get today's games
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
          if (!team) continue;

          const liveGame = todayGames.find(g =>
            (g.home_abbr === team || g.away_abbr === team) &&
            (g.status === "live" || g.status === "in_progress")
          );
          const anyGame = liveGame || todayGames.find(g =>
            g.home_abbr === team || g.away_abbr === team
          );

          if (anyGame) {
            await sb.from("bet_slip_picks")
              .update({ game_id: anyGame.id })
              .eq("id", pick.id);
            gameIdResults.push(`${pick.player_name_raw} → ${anyGame.id.slice(0, 8)}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      team_fixes: results,
      game_id_backfills: gameIdResults,
      null_picks_found: nullPicks?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
