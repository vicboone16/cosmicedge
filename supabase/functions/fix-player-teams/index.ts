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

    // 1. Read ALL bet_slip_picks
    const { data: allPicks, error: pickErr } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw, game_id, slip_id")
      .order("slip_id");

    if (pickErr) {
      return new Response(JSON.stringify({ error: pickErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nullPicks = (allPicks || []).filter(p => !p.game_id);
    const withGame = (allPicks || []).filter(p => p.game_id);

    // 2. For null picks, resolve game_id
    const fixes: any[] = [];

    if (nullPicks.length > 0) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: players } = await sb
        .from("players")
        .select("id, name, team")
        .in("id", playerIds as string[]);

      const teamMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      players?.forEach(p => {
        if (p.team) teamMap[p.id] = p.team;
        nameMap[p.id] = p.name;
      });

      // Get today's games
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayGames } = await sb
        .from("games")
        .select("id, home_abbr, away_abbr, status, start_time")
        .gte("start_time", `${today}T00:00:00Z`)
        .lte("start_time", `${today}T23:59:59Z`);

      for (const pick of nullPicks) {
        if (!pick.player_id) {
          fixes.push({ player: pick.player_name_raw, status: "no_player_id" });
          continue;
        }
        const team = teamMap[pick.player_id];
        if (!team) {
          fixes.push({ player: pick.player_name_raw, player_id: pick.player_id, status: "no_team" });
          continue;
        }

        const game = todayGames?.find(g =>
          (g.home_abbr === team || g.away_abbr === team) &&
          (g.status === "live" || g.status === "in_progress")
        ) || todayGames?.find(g =>
          g.home_abbr === team || g.away_abbr === team
        );

        if (game) {
          const { error: updErr } = await sb
            .from("bet_slip_picks")
            .update({ game_id: game.id })
            .eq("id", pick.id);
          fixes.push({
            player: pick.player_name_raw,
            team,
            game: `${game.away_abbr}@${game.home_abbr}`,
            game_id: game.id.slice(0, 8),
            error: updErr?.message || null,
            status: updErr ? "error" : "fixed",
          });
        } else {
          fixes.push({
            player: pick.player_name_raw,
            team,
            status: "no_game_today",
            available_games: todayGames?.map(g => `${g.away_abbr}@${g.home_abbr}(${g.status})`),
          });
        }
      }
    }

    // 3. Read team status for key players
    const { data: keyPlayers } = await sb
      .from("players")
      .select("name, team")
      .in("name", ["Anthony Edwards", "Naz Reid", "Ayo Dosunmu", "Jaden McDaniels", "Rudy Gobert"])
      .eq("league", "NBA");

    return new Response(JSON.stringify({
      total_picks: allPicks?.length || 0,
      with_game: withGame.length,
      null_game: nullPicks.length,
      fixes,
      key_players: keyPlayers,
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
