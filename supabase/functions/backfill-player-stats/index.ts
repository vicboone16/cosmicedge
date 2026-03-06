import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * backfill-player-stats
 * 
 * Automatically grabs player game stats for recently completed games
 * using SportsDataIO box scores, then saves to player_game_stats.
 * 
 * Modes:
 *  - recent (default): Fetches box scores for the last N days
 *  - date: Fetches box scores for a specific date
 */

const SDIO_API_BASE = "https://api.sportsdata.io/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let body: Record<string, any> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* empty */ }
    }

    const league = (body.league || url.searchParams.get("league") || "NBA").toUpperCase();
    const mode = body.mode || url.searchParams.get("mode") || "recent";
    const daysBack = parseInt(body.days_back || url.searchParams.get("days_back") || "3");

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = league.toLowerCase();
    const dates: string[] = [];

    if (mode === "date") {
      const d = body.date || url.searchParams.get("date");
      if (!d) throw new Error("date param required for mode=date");
      dates.push(d);
    } else {
      // Recent mode: last N days
      for (let i = 0; i < daysBack; i++) {
        const d = new Date(Date.now() - i * 86400000);
        dates.push(d.toISOString().slice(0, 10));
      }
    }

    let totalPlayerStats = 0;
    let totalTeamStats = 0;
    let totalQuarters = 0;
    let totalGamesProcessed = 0;
    const errors: string[] = [];

    for (const date of dates) {
      try {
        // Fetch box scores from SportsDataIO
        const apiUrl = `${SDIO_API_BASE}/${slug}/stats/json/BoxScores/${date}?key=${sdioKey}`;
        console.log(`[backfill] Fetching ${league} box scores for ${date}`);
        const resp = await fetch(apiUrl);

        if (!resp.ok) {
          if (resp.status === 404) {
            console.log(`[backfill] No games on ${date}`);
            continue;
          }
          errors.push(`${date}: HTTP ${resp.status}`);
          continue;
        }

        const boxScores = await resp.json();
        if (!boxScores?.length) continue;

        for (const box of boxScores) {
          const game = box.Game;
          if (!game) continue;

          // Find game in DB
          const homeAbbr = game.HomeTeam;
          const awayAbbr = game.AwayTeam;
          const gameDateTime = game.DateTime;

          if (!homeAbbr || !awayAbbr) continue;

          // Match by team + date window
          const gameDate = gameDateTime?.split("T")[0] || date;
          const d = new Date(gameDate);
          const dayBefore = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
          const dayAfter = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);

          const { data: dbGame } = await supabase
            .from("games")
            .select("id")
            .eq("home_abbr", homeAbbr)
            .eq("away_abbr", awayAbbr)
            .eq("league", league)
            .gte("start_time", `${dayBefore}T00:00:00Z`)
            .lte("start_time", `${dayAfter}T23:59:59Z`)
            .maybeSingle();

          if (!dbGame) continue;
          const gameId = dbGame.id;
          totalGamesProcessed++;

          // Update game score & status
          const isFinal = game.Status === "Final" || game.Status === "F/OT";
          if (game.HomeTeamScore != null) {
            await supabase.from("games").update({
              home_score: game.HomeTeamScore,
              away_score: game.AwayTeamScore,
              status: isFinal ? "final" : game.Status === "InProgress" ? "live" : "scheduled",
            }).eq("id", gameId);
          }

          // Quarter scores
          for (const q of box.Quarters || []) {
            await supabase.from("game_quarters").upsert({
              game_id: gameId,
              quarter: q.Number,
              home_score: q.HomeScore || 0,
              away_score: q.AwayScore || 0,
            }, { onConflict: "game_id,quarter" });
            totalQuarters++;
          }

          // Team stats
          for (const ts of box.TeamGames || []) {
            await supabase.from("team_game_stats").upsert({
              game_id: gameId,
              team_abbr: ts.Team,
              is_home: ts.HomeOrAway === "HOME",
              points: ts.Points || 0,
              rebounds: ts.Rebounds || 0,
              assists: ts.Assists || 0,
              steals: ts.Steals || 0,
              blocks: ts.BlockedShots || 0,
              turnovers: ts.Turnovers || 0,
              fg_made: ts.FieldGoalsMade || 0,
              fg_attempted: ts.FieldGoalsAttempted || 0,
              three_made: ts.ThreePointersMade || 0,
              three_attempted: ts.ThreePointersAttempted || 0,
              ft_made: ts.FreeThrowsMade || 0,
              ft_attempted: ts.FreeThrowsAttempted || 0,
              off_rebounds: ts.OffensiveRebounds || 0,
              def_rebounds: ts.DefensiveRebounds || 0,
              fast_break_points: ts.FastBreakPoints || 0,
              points_in_paint: ts.PointsInPaint || 0,
              bench_points: ts.BenchPoints || 0,
              second_chance_points: ts.SecondChancePoints || 0,
              off_rating: ts.OffensiveRating || null,
              def_rating: ts.DefensiveRating || null,
              pace: ts.Pace || null,
              possessions: ts.Possessions || null,
            }, { onConflict: "game_id,team_abbr" });
            totalTeamStats++;
          }

          // Player stats
          const playerExternalIds = (box.PlayerGames || [])
            .map((p: any) => String(p.PlayerID));

          const { data: playerRows } = await supabase
            .from("players")
            .select("id, external_id")
            .in("external_id", playerExternalIds);

          const idMap = new Map<string, string>();
          for (const row of playerRows || []) {
            idMap.set(row.external_id!, row.id);
          }

          for (const ps of box.PlayerGames || []) {
            const playerId = idMap.get(String(ps.PlayerID));
            if (!playerId) continue;

            await supabase.from("player_game_stats").upsert({
              game_id: gameId,
              player_id: playerId,
              team_abbr: ps.Team,
              period: "full",
              starter: ps.Started === 1,
              minutes: ps.Minutes || null,
              points: ps.Points || 0,
              rebounds: ps.Rebounds || 0,
              assists: ps.Assists || 0,
              steals: ps.Steals || 0,
              blocks: ps.BlockedShots || 0,
              turnovers: ps.Turnovers || 0,
              fouls: ps.PersonalFouls || 0,
              fg_made: ps.FieldGoalsMade || 0,
              fg_attempted: ps.FieldGoalsAttempted || 0,
              three_made: ps.ThreePointersMade || 0,
              three_attempted: ps.ThreePointersAttempted || 0,
              ft_made: ps.FreeThrowsMade || 0,
              ft_attempted: ps.FreeThrowsAttempted || 0,
              off_rebounds: ps.OffensiveRebounds || 0,
              def_rebounds: ps.DefensiveRebounds || 0,
              plus_minus: ps.PlusMinus || 0,
              fantasy_points: ps.FantasyPoints || null,
            }, { onConflict: "game_id,player_id,period" });
            totalPlayerStats++;
          }
        }
      } catch (e: any) {
        errors.push(`${date}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dates_processed: dates.length,
        games_processed: totalGamesProcessed,
        player_stats: totalPlayerStats,
        team_stats: totalTeamStats,
        quarters: totalQuarters,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("backfill-player-stats error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
