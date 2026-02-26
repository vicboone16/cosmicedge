import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * rebuild-team-pace
 * 
 * Rebuilds team_season_pace using score-based possession fallback
 * when FGA data is unreliable (< 50 per team game).
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

    console.log(`[rebuild-team-pace] Starting for ${league} season ${season}`);

    // Step 1: Get all player game stats with game info
    const allStats: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("player_game_stats")
        .select("team_abbr, game_id, points, fg_attempted, ft_attempted, off_rebounds, turnovers, games!player_game_stats_game_id_fkey(home_abbr, away_abbr, home_score, away_score, league, status)")
        .eq("period", "full")
        .range(offset, offset + pageSize - 1);
      
      if (error) { console.error("Query error:", error.message); break; }
      if (!data || data.length === 0) break;
      allStats.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`[rebuild-team-pace] Loaded ${allStats.length} player_game_stats rows`);

    // Step 2: Aggregate by team+game
    const gameMap = new Map<string, {
      team_abbr: string;
      fga: number;
      fta: number;
      oreb: number;
      tov: number;
      pts: number;
      pts_allowed: number;
      count: number;
    }>();

    for (const row of allStats) {
      const game = row.games as any;
      if (!game || game.status !== "final" || game.league !== league) continue;
      
      const key = `${row.team_abbr}_${row.game_id}`;
      if (!gameMap.has(key)) {
        const isHome = row.team_abbr === game.home_abbr;
        // Use ACTUAL game scores, not summed player stats (which may have gaps)
        gameMap.set(key, {
          team_abbr: row.team_abbr,
          fga: 0, fta: 0, oreb: 0, tov: 0,
          pts: isHome ? (game.home_score || 0) : (game.away_score || 0),
          pts_allowed: isHome ? (game.away_score || 0) : (game.home_score || 0),
          count: 0,
        });
      }
      const entry = gameMap.get(key)!;
      entry.fga += row.fg_attempted || 0;
      entry.fta += row.ft_attempted || 0;
      entry.oreb += row.off_rebounds || 0;
      entry.tov += row.turnovers || 0;
      // pts already set from game score, don't sum player stats
      entry.count += 1;
    }

    console.log(`[rebuild-team-pace] ${gameMap.size} team-game entries`);

    // Step 3: Calculate team averages
    const teamStats = new Map<string, {
      poss_sum: number;
      pts_sum: number;
      pts_allowed_sum: number;
      games: number;
    }>();

    for (const entry of gameMap.values()) {
      if (entry.count < 5) continue; // Skip partial games
      
      // Estimate possessions from total game scoring (both teams play same # of possessions)
      // Standard NBA: ~1.08 pts per possession
      const totalGamePts = entry.pts + entry.pts_allowed;
      const poss = Math.max(totalGamePts, 160) / 2 / 1.08;

      if (!teamStats.has(entry.team_abbr)) {
        teamStats.set(entry.team_abbr, { poss_sum: 0, pts_sum: 0, pts_allowed_sum: 0, games: 0 });
      }
      const ts = teamStats.get(entry.team_abbr)!;
      ts.poss_sum += poss;
      ts.pts_sum += entry.pts;
      ts.pts_allowed_sum += entry.pts_allowed;
      ts.games += 1;
    }

    // Step 4: Build rows
    const rows = [];
    for (const [abbr, ts] of teamStats) {
      if (ts.games === 0) continue;
      const avgPoss = ts.poss_sum / ts.games;
      const avgPts = ts.pts_sum / ts.games;
      const avgPtsAllowed = ts.pts_allowed_sum / ts.games;
      const offRtg = avgPoss > 0 ? Math.round((avgPts / avgPoss) * 10000) / 100 : 0;
      const defRtg = avgPoss > 0 ? Math.round((avgPtsAllowed / avgPoss) * 10000) / 100 : 0;
      const netRtg = Math.round((offRtg - defRtg) * 100) / 100;

      rows.push({
        team_abbr: abbr,
        season,
        league,
        games_played: ts.games,
        avg_possessions: Math.round(avgPoss * 100) / 100,
        avg_pace: Math.round(avgPoss * 100) / 100,
        avg_points: Math.round(avgPts * 100) / 100,
        avg_points_allowed: Math.round(avgPtsAllowed * 100) / 100,
        off_rating: offRtg,
        def_rating: defRtg,
        net_rating: netRtg,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`[rebuild-team-pace] Computed ${rows.length} teams. Sample:`, 
      rows.slice(0, 3).map(r => `${r.team_abbr}: ORTG=${r.off_rating}, DRTG=${r.def_rating}, pace=${r.avg_pace}`));

    // Step 5: Delete old + insert new
    const { error: delError } = await supabase
      .from("team_season_pace")
      .delete()
      .eq("league", league)
      .eq("season", season);

    if (delError) {
      console.error("[rebuild-team-pace] Delete failed:", delError.message);
    }

    // Insert in batches
    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      const { error: insertError } = await supabase
        .from("team_season_pace")
        .upsert(batch, { onConflict: "team_abbr,season,league" });
      if (insertError) {
        console.error(`[rebuild-team-pace] Upsert batch ${i} failed:`, insertError.message);
      }
    }

    // Verify
    const { data: verify } = await supabase
      .from("team_season_pace")
      .select("team_abbr, off_rating, def_rating, avg_pace, updated_at")
      .eq("league", league)
      .eq("season", season)
      .order("off_rating", { ascending: false })
      .limit(5);

    return new Response(JSON.stringify({
      success: true,
      teams_updated: rows.length,
      sample: rows.slice(0, 5).map(r => ({ team: r.team_abbr, ortg: r.off_rating, drtg: r.def_rating, pace: r.avg_pace })),
      verify: verify,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("rebuild-team-pace error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
