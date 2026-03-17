import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Known correct 2025-26 MIN roster (per user confirmation + current season)
const MIN_ROSTER = [
  "Anthony Edwards", "Rudy Gobert", "Julius Randle", "Naz Reid",
  "Jaden McDaniels", "Donte DiVincenzo", "Ayo Dosunmu",
  "Nickeil Alexander-Walker", "Terrence Shannon Jr.", "Jaylen Clark",
  "Rob Dillingham", "Leonard Miller", "Luka Garza",
  "Joe Ingles", "Josh Minott",
];

// Known correct 2025-26 DAL roster (BDL has these right)
const DAL_ROSTER = [
  "Luka Doncic", "Kyrie Irving", "Klay Thompson", "P.J. Washington",
  "Daniel Gafford", "Dereck Lively II", "Dwight Powell", "Maxi Kleber",
  "Jaden Hardy", "Spencer Dinwiddie", "Seth Curry",
  "AJ Johnson", "Ryan Nembhard", "Cooper Flagg", "Moussa Cisse",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const changes: string[] = [];
    const fixes = [
      ...MIN_ROSTER.map(name => ({ name, team: "MIN" })),
      ...DAL_ROSTER.map(name => ({ name, team: "DAL" })),
    ];

    for (const fix of fixes) {
      const { data: rows } = await sb
        .from("players")
        .select("id, name, team")
        .eq("league", "NBA")
        .ilike("name", fix.name);

      for (const row of rows || []) {
        if (row.team === fix.team) continue;
        const { error } = await sb.from("players").update({ team: fix.team }).eq("id", row.id);
        if (!error) {
          changes.push(`${row.name}: ${row.team} → ${fix.team}`);
        }
      }
    }

    // Also backfill game_ids
    const { data: nullPicks } = await sb
      .from("bet_slip_picks")
      .select("id, player_id, player_name_raw")
      .is("game_id", null);

    const gameIdFixes: string[] = [];
    if (nullPicks?.length) {
      const playerIds = [...new Set(nullPicks.map(p => p.player_id).filter(Boolean))];
      const { data: plrs } = await sb.from("players").select("id, team").in("id", playerIds as string[]);
      const teamLookup: Record<string, string> = {};
      plrs?.forEach(p => { if (p.team) teamLookup[p.id] = p.team; });

      const _now = new Date();
      const yesterdayISO = new Date(_now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tomorrowISO = new Date(_now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: todayGames } = await sb.from("games").select("id, home_abbr, away_abbr, status")
        .gte("start_time", `${yesterdayISO}T00:00:00Z`).lte("start_time", `${tomorrowISO}T23:59:59Z`);

      if (todayGames?.length) {
        for (const pick of nullPicks) {
          if (!pick.player_id) continue;
          const team = teamLookup[pick.player_id];
          if (!team) continue;
          const game = todayGames.find(g =>
            (g.home_abbr === team || g.away_abbr === team) &&
            (g.status === "live" || g.status === "in_progress")
          ) || todayGames.find(g => g.home_abbr === team || g.away_abbr === team);
          if (game) {
            await sb.from("bet_slip_picks").update({ game_id: game.id }).eq("id", pick.id);
            gameIdFixes.push(`${pick.player_name_raw} → ${game.id.slice(0, 8)}`);
          }
        }
      }
    }

    // Read back key players to confirm
    const { data: verify } = await sb
      .from("players")
      .select("name, team")
      .eq("league", "NBA")
      .in("name", ["Anthony Edwards", "Naz Reid", "Ayo Dosunmu", "Rudy Gobert", "Julius Randle",
        "Jaden McDaniels", "Cooper Flagg", "Kyrie Irving", "Luka Doncic", "Rob Dillingham"]);

    return new Response(JSON.stringify({
      ok: true,
      changes,
      game_id_fixes: gameIdFixes,
      verification: verify,
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
