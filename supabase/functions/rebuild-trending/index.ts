import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const now = new Date().toISOString();

    // ── TRENDING PLAYERS ──
    // Tier 1: Try player_game_stats composite scores (last 14 days)
    let trendingPlayers: {
      player_id: string;
      player_name: string;
      team: string;
      position: string;
      headshot_url: string | null;
      trend_score: number;
      reason: Record<string, unknown>;
    }[] = [];

    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

    const { data: recentStats } = await supabase
      .from("player_game_stats")
      .select("player_id, points, rebounds, assists, steals, blocks, turnovers, game_id, league")
      .eq("period", "full")
      .eq("league", "NBA")
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (recentStats && recentStats.length >= 10) {
      // Aggregate composite scores per player
      const scores = new Map<string, { total: number; count: number }>();
      for (const s of recentStats) {
        const composite =
          (s.points ?? 0) + (s.rebounds ?? 0) + (s.assists ?? 0) +
          (s.steals ?? 0) + (s.blocks ?? 0) - (s.turnovers ?? 0);
        const prev = scores.get(s.player_id) || { total: 0, count: 0 };
        scores.set(s.player_id, { total: prev.total + composite, count: prev.count + 1 });
      }

      const ranked = Array.from(scores.entries())
        .map(([id, { total, count }]) => ({ id, avg: total / count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 25);

      // Fetch player details
      const ids = ranked.map((r) => r.id);
      const { data: players } = await supabase
        .from("players")
        .select("id, name, team, position, headshot_url")
        .in("id", ids);

      if (players && players.length >= 10) {
        const playerMap = new Map(players.map((p) => [p.id, p]));
        trendingPlayers = ranked
          .filter((r) => playerMap.has(r.id))
          .map((r, i) => {
            const p = playerMap.get(r.id)!;
            return {
              player_id: p.id,
              player_name: p.name,
              team: p.team ?? "",
              position: p.position ?? "",
              headshot_url: p.headshot_url,
              trend_score: Math.round(r.avg * 10) / 10,
              reason: { method: "game_stats_composite", games: scores.get(r.id)?.count ?? 0 },
            };
          });
      }
    }

    // Tier 2: Raw box scores from Apify
    if (trendingPlayers.length < 10) {
      const { data: rawBoxes } = await supabase
        .from("player_boxscores_raw")
        .select("payload")
        .order("captured_at", { ascending: false })
        .limit(500);

      if (rawBoxes && rawBoxes.length > 0) {
        const scoreMap = new Map<string, { score: number; name: string; team: string }>();
        for (const row of rawBoxes) {
          const p = (row.payload ?? {}) as Record<string, any>;
          const name = String(p.playerName ?? p.player_name ?? p.name ?? "");
          if (!name) continue;
          const pts = Number(p.points ?? p.pts ?? 0);
          const reb = Number(p.rebounds ?? p.reb ?? 0);
          const ast = Number(p.assists ?? p.ast ?? 0);
          const stl = Number(p.steals ?? p.stl ?? 0);
          const blk = Number(p.blocks ?? p.blk ?? 0);
          const tov = Number(p.turnovers ?? p.tov ?? 0);
          const composite = pts + reb + ast + stl + blk - tov;
          const cur = scoreMap.get(name);
          if (!cur || composite > cur.score) {
            scoreMap.set(name, { score: composite, name, team: p.team_abbr ?? p.team ?? "" });
          }
        }

        const topRaw = Array.from(scoreMap.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, 25);

        for (const r of topRaw) {
          if (trendingPlayers.length >= 25) break;
          if (trendingPlayers.some((t) => t.player_name === r.name)) continue;
          trendingPlayers.push({
            player_id: "",
            player_name: r.name,
            team: r.team,
            position: "",
            headshot_url: null,
            trend_score: r.score,
            reason: { method: "raw_boxscore" },
          });
        }
      }
    }

    // Tier 3: Guaranteed fallback — NBA players with headshots
    if (trendingPlayers.length < 10) {
      const { data: fallback } = await supabase
        .from("players")
        .select("id, name, team, position, headshot_url")
        .eq("league", "NBA")
        .not("headshot_url", "is", null)
        .order("name")
        .limit(25);

      for (const p of fallback ?? []) {
        if (trendingPlayers.length >= 25) break;
        if (trendingPlayers.some((t) => t.player_name === p.name)) continue;
        trendingPlayers.push({
          player_id: p.id,
          player_name: p.name,
          team: p.team ?? "",
          position: p.position ?? "",
          headshot_url: p.headshot_url,
          trend_score: 0,
          reason: { method: "fallback_popular" },
        });
      }
    }

    // Upsert trending_players (replace all for NBA)
    await supabase.from("trending_players").delete().eq("league", "NBA");
    if (trendingPlayers.length > 0) {
      await supabase.from("trending_players").insert(
        trendingPlayers.map((p, i) => ({
          league: "NBA",
          player_id: p.player_id || null,
          player_name: p.player_name,
          team: p.team,
          position: p.position,
          headshot_url: p.headshot_url,
          trend_score: p.trend_score,
          rank: i + 1,
          reason: p.reason,
          as_of: now,
        }))
      );
    }

    // ── TRENDING TEAMS ──
    // Use recent game results to compute momentum
    const { data: recentGames } = await supabase
      .from("games")
      .select("home_abbr, away_abbr, home_score, away_score, league")
      .in("status", ["final", "Final"])
      .order("start_time", { ascending: false })
      .limit(500);

    const teamMomentum = new Map<string, { league: string; wins: number; total: number }>();
    for (const g of recentGames ?? []) {
      if (!g.home_score || !g.away_score) continue;
      const league = g.league ?? "NBA";

      for (const abbr of [g.home_abbr, g.away_abbr]) {
        const prev = teamMomentum.get(abbr) || { league, wins: 0, total: 0 };
        prev.total++;
        const isHome = abbr === g.home_abbr;
        if ((isHome && g.home_score > g.away_score) || (!isHome && g.away_score > g.home_score)) {
          prev.wins++;
        }
        teamMomentum.set(abbr, prev);
      }
    }

    const trendingTeams = Array.from(teamMomentum.entries())
      .map(([abbr, data]) => ({
        team_abbr: abbr,
        league: data.league,
        trend_score: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
        reason: { wins: data.wins, total: data.total, method: "win_pct_recent" },
      }))
      .sort((a, b) => b.trend_score - a.trend_score)
      .slice(0, 30);

    // Replace trending_teams
    await supabase.from("trending_teams").delete().neq("league", "___never___");
    if (trendingTeams.length > 0) {
      await supabase.from("trending_teams").insert(
        trendingTeams.map((t, i) => ({
          league: t.league,
          team_abbr: t.team_abbr,
          team_name: t.team_abbr,
          trend_score: t.trend_score,
          rank: i + 1,
          reason: t.reason,
          as_of: now,
        }))
      );
    }

    console.log(`[rebuild-trending] Players: ${trendingPlayers.length}, Teams: ${trendingTeams.length}`);

    return new Response(JSON.stringify({
      ok: true,
      trending_players: trendingPlayers.length,
      trending_teams: trendingTeams.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[rebuild-trending] Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
