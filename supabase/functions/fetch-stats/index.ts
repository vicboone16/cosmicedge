import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SDIO_API_BASE = "https://api.sportsdata.io/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const mode = url.searchParams.get("mode") || "team_season"; // team_season | box_scores | schedules
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const season = url.searchParams.get("season") || String(new Date().getFullYear());

    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const slug = league.toLowerCase();
    const meta: Record<string, any> = { league, mode };

    if (mode === "team_season") {
      // ── Team Season Stats ──
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/TeamSeasonStats/${season}?key=${sdioKey}`);
      if (!resp.ok) throw new Error(`Team season stats error: ${resp.status}`);
      const teams = await resp.json();

      const records = teams.map((t: any) => {
        const gp = Math.max(t.Games || 1, 1);
        return {
          team_abbr: t.Team || t.Key,
          season: Number(season),
          league,
          points_per_game: t.Points ? +(t.Points / gp).toFixed(1) : null,
          opp_points_per_game: t.OpponentPoints ? +(t.OpponentPoints / gp).toFixed(1) : null,
          fg_pct: t.FieldGoalsPercentage || null,
          three_pct: t.ThreePointersPercentage || null,
          ft_pct: t.FreeThrowsPercentage || null,
          off_rating: t.OffensiveRating || null,
          def_rating: t.DefensiveRating || null,
          net_rating: t.OffensiveRating && t.DefensiveRating ? +(t.OffensiveRating - t.DefensiveRating).toFixed(1) : null,
          pace: t.Pace || null,
          opp_fg_pct: t.OpponentFieldGoalsPercentage || null,
          opp_three_pct: t.OpponentThreePointersPercentage || null,
          reb_pct: t.TotalReboundsPercentage || null,
          ast_pct: t.AssistsPercentage || null,
          tov_pct: t.TurnoversPercentage || null,
        };
      });

      const { error } = await supabase
        .from("team_season_stats")
        .upsert(records, { onConflict: "team_abbr,season,league", ignoreDuplicates: false });

      if (error) throw error;
      meta.teams_upserted = records.length;

    } else if (mode === "box_scores") {
      // ── Box Scores for a given date ──
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/stats/json/BoxScores/${date}?key=${sdioKey}`);
      if (!resp.ok) throw new Error(`Box scores error: ${resp.status}`);
      const boxScores = await resp.json();

      let playerStatsCount = 0;
      let teamStatsCount = 0;
      let quartersCount = 0;

      for (const box of boxScores) {
        const game = box.Game;
        if (!game) continue;

        // Find game in our DB by external_id or team+time match
        const externalId = `sdio_${game.GameID}`;
        let { data: dbGame } = await supabase
          .from("games")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        if (!dbGame) {
          // Try team-name match
          const startTime = new Date(game.DateTime);
          const timeBefore = new Date(startTime.getTime() - 3600000).toISOString();
          const timeAfter = new Date(startTime.getTime() + 3600000).toISOString();
          const { data: matched } = await supabase
            .from("games")
            .select("id")
            .eq("home_abbr", game.HomeTeam)
            .eq("away_abbr", game.AwayTeam)
            .gte("start_time", timeBefore)
            .lte("start_time", timeAfter)
            .maybeSingle();
          dbGame = matched;
        }

        if (!dbGame) continue;
        const gameId = dbGame.id;

        // Update game score
        if (game.HomeTeamScore != null) {
          await supabase.from("games").update({
            home_score: game.HomeTeamScore,
            away_score: game.AwayTeamScore,
            status: game.Status === "Final" ? "final" : game.Status === "InProgress" ? "live" : "scheduled",
          }).eq("id", gameId);
        }

        // ── Quarters ──
        for (const q of box.Quarters || []) {
          const qRecord = {
            game_id: gameId,
            quarter: q.Number,
            home_score: q.HomeScore || 0,
            away_score: q.AwayScore || 0,
          };
          await supabase.from("game_quarters").upsert(qRecord, { onConflict: "game_id,quarter" });
          quartersCount++;
        }

        // ── Team Stats ──
        for (const ts of box.TeamGames || []) {
          const isHome = ts.HomeOrAway === "HOME";
          const teamRecord = {
            game_id: gameId,
            team_abbr: ts.Team,
            is_home: isHome,
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
          };
          await supabase.from("team_game_stats").upsert(teamRecord, { onConflict: "game_id,team_abbr" });
          teamStatsCount++;
        }

        // ── Player Stats ──
        // Fetch player UUID mapping
        const playerExternalIds = (box.PlayerGames || []).map((p: any) => String(p.PlayerID));
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

          const playerRecord = {
            game_id: gameId,
            player_id: playerId,
            team_abbr: ps.Team,
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
          };
          await supabase.from("player_game_stats").upsert(playerRecord, { onConflict: "game_id,player_id" });
          playerStatsCount++;
        }
      }

      meta.box_scores_processed = boxScores.length;
      meta.player_stats = playerStatsCount;
      meta.team_stats = teamStatsCount;
      meta.quarters = quartersCount;

    } else if (mode === "schedules") {
      // ── Game schedules for the season ──
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/Games/${season}?key=${sdioKey}`);
      if (!resp.ok) throw new Error(`Schedules error: ${resp.status}`);
      const games = await resp.json();

      let count = 0;
      for (const g of games) {
        const gameRecord = {
          external_id: `sdio_${g.GameID}`,
          league,
          home_team: g.HomeTeam ? `${g.HomeTeam}` : "",
          away_team: g.AwayTeam ? `${g.AwayTeam}` : "",
          home_abbr: g.HomeTeam || "",
          away_abbr: g.AwayTeam || "",
          start_time: g.DateTime || g.Day,
          status: g.Status === "Final" ? "final" : g.Status === "InProgress" ? "live" : "scheduled",
          venue: g.StadiumID ? null : null,
          home_score: g.HomeTeamScore || null,
          away_score: g.AwayTeamScore || null,
        };

        // Match stadium
        if (g.StadiumID) {
          const { data: stadium } = await supabase
            .from("stadiums")
            .select("name, latitude, longitude")
            .eq("team_abbr", g.HomeTeam)
            .eq("league", league)
            .maybeSingle();

          if (stadium) {
            gameRecord.venue = stadium.name;
          }
        }

        await supabase
          .from("games")
          .upsert(gameRecord, { onConflict: "external_id" });
        count++;
      }

      meta.schedules_upserted = count;
    }

    return new Response(
      JSON.stringify({ success: true, meta, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-stats error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
