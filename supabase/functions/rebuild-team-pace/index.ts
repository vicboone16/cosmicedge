import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * rebuild-team-pace
 * 
 * Rebuilds team_season_pace from game scores (all leagues).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty */ }
    const league = (body.league || "NBA").toUpperCase();
    const season = body.season || 2025;

    const seasonStart = `${season}-10-01T00:00:00Z`;
    const seasonEnd = `${season + 1}-07-01T00:00:00Z`;

    console.log(`[rebuild-team-pace] Starting for ${league} season ${season} (${seasonStart} to ${seasonEnd})`);

    // Step 1: Fetch all final games with scores
    const allGames: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, home_score, away_score")
        .eq("league", league)
        .eq("status", "final")
        .gte("start_time", seasonStart)
        .lte("start_time", seasonEnd)
        .not("home_score", "is", null)
        .not("away_score", "is", null)
        .range(offset, offset + pageSize - 1);
      if (error) { console.error("Query error:", error.message); break; }
      if (!data || data.length === 0) break;
      allGames.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`[rebuild-team-pace] Found ${allGames.length} final games for ${league}`);

    // Step 2: Aggregate by team
    const teamStats = new Map<string, { ptsFor: number; ptsAgainst: number; games: number }>();

    for (const g of allGames) {
      if (!teamStats.has(g.home_abbr)) teamStats.set(g.home_abbr, { ptsFor: 0, ptsAgainst: 0, games: 0 });
      const h = teamStats.get(g.home_abbr)!;
      h.ptsFor += g.home_score;
      h.ptsAgainst += g.away_score;
      h.games += 1;

      if (!teamStats.has(g.away_abbr)) teamStats.set(g.away_abbr, { ptsFor: 0, ptsAgainst: 0, games: 0 });
      const a = teamStats.get(g.away_abbr)!;
      a.ptsFor += g.away_score;
      a.ptsAgainst += g.home_score;
      a.games += 1;
    }

    // Step 3: Compute ratings
    const rows = [];
    for (const [abbr, ts] of teamStats) {
      if (ts.games === 0) continue;
      const avgPts = ts.ptsFor / ts.games;
      const avgPtsAllowed = ts.ptsAgainst / ts.games;

      let offRtg: number, defRtg: number, pace: number;

      if (league === "NBA") {
        const totalGamePts = avgPts + avgPtsAllowed;
        pace = Math.max(totalGamePts, 160) / 2 / 1.08;
        offRtg = pace > 0 ? (avgPts / pace) * 100 : 0;
        defRtg = pace > 0 ? (avgPtsAllowed / pace) * 100 : 0;
      } else {
        // NHL/NFL/MLB: use raw scoring rates
        pace = avgPts + avgPtsAllowed;
        offRtg = avgPts;
        defRtg = avgPtsAllowed;
      }

      const netRtg = Math.round((offRtg - defRtg) * 100) / 100;

      rows.push({
        team_abbr: abbr,
        season,
        league,
        games_played: ts.games,
        avg_possessions: Math.round(pace * 100) / 100,
        avg_pace: Math.round(pace * 100) / 100,
        avg_points: Math.round(avgPts * 100) / 100,
        avg_points_allowed: Math.round(avgPtsAllowed * 100) / 100,
        off_rating: Math.round(offRtg * 100) / 100,
        def_rating: Math.round(defRtg * 100) / 100,
        net_rating: netRtg,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`[rebuild-team-pace] Computed ${rows.length} teams. Sample:`,
      rows.slice(0, 3).map(r => `${r.team_abbr}: ORTG=${r.off_rating}, DRTG=${r.def_rating}, pace=${r.avg_pace}, GP=${r.games_played}`));

    // Step 4: Delete old + upsert
    await supabase.from("team_season_pace").delete().eq("league", league).eq("season", season);

    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      const { error: insertError } = await supabase
        .from("team_season_pace")
        .upsert(batch, { onConflict: "team_abbr,season,league" });
      if (insertError) console.error(`[rebuild-team-pace] Upsert batch ${i} failed:`, insertError.message);
    }

    const { data: verify } = await supabase
      .from("team_season_pace")
      .select("team_abbr, off_rating, def_rating, avg_pace, games_played")
      .eq("league", league)
      .eq("season", season)
      .order("off_rating", { ascending: false })
      .limit(5);

    return new Response(JSON.stringify({
      success: true, league, season,
      teams_updated: rows.length, total_games: allGames.length,
      sample: rows.slice(0, 5).map(r => ({ team: r.team_abbr, ortg: r.off_rating, drtg: r.def_rating, pace: r.avg_pace, gp: r.games_played })),
      verify,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("rebuild-team-pace error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
