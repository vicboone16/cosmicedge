import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SDIO_API_BASE = "https://api.sportsdata.io/v3";
const BDL_BASE = "https://api.balldontlie.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const league = url.searchParams.get("league") || "NBA";
    const mode = url.searchParams.get("mode") || "team_season";
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const season = url.searchParams.get("season") || String(new Date().getFullYear());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const meta: Record<string, any> = { league, mode };
    const isNBA = league.toUpperCase() === "NBA";
    const bdlKey = Deno.env.get("BALLDONTLIE_KEY");
    const sdioKey = Deno.env.get("SPORTSDATAIO_API_KEY");
    const bdlHeaders = bdlKey ? { Authorization: bdlKey } : undefined;

    // ─── team_season ───
    if (mode === "team_season") {
      let records: any[] = [];

      // Try BDL first for NBA
      if (isNBA && bdlHeaders) {
        try {
          console.log("[fetch-stats] Using BDL for NBA team season stats");
          const resp = await fetch(`${BDL_BASE}/v1/season_averages?season=${season}`, { headers: bdlHeaders });
          if (resp.ok) {
            // BDL doesn't have a direct team season stats endpoint,
            // so we'll aggregate from our own player_game_stats instead
            console.log("[fetch-stats] BDL: Aggregating team stats from player_game_stats");
          }
        } catch (e) {
          console.warn("[fetch-stats] BDL team stats failed:", e);
        }

        // Aggregate team season stats from player_game_stats (self-computing approach)
        const { data: teamStats, error: aggErr } = await supabase.rpc("np_rebuild_team_pace", {
          p_season: Number(season),
          p_league: league,
        });
        if (!aggErr) {
          meta.provider = "self-computed";
          meta.teams_rebuilt = teamStats;

          // Also fetch live BDL standings/teams for supplemental data
          try {
            const teamsResp = await fetch(`${BDL_BASE}/v1/teams`, { headers: bdlHeaders });
            if (teamsResp.ok) {
              const teamsData = await teamsResp.json();
              meta.bdl_teams = (teamsData.data || []).length;
            }
          } catch (_) { /* ignore */ }
        }

        records = []; // Already handled via RPC
      }

      // Fallback to SDIO for non-NBA or if BDL not available
      if (!isNBA || (!bdlHeaders && sdioKey)) {
        if (!sdioKey) throw new Error("No API key available for stats");
        const slug = league.toLowerCase();
        const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/TeamSeasonStats/${season}?key=${sdioKey}`);
        if (!resp.ok) throw new Error(`Team season stats error: ${resp.status}`);
        const teams = await resp.json();

        records = teams.map((t: any) => {
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

        if (records.length > 0) {
          const { error } = await supabase
            .from("team_season_stats")
            .upsert(records, { onConflict: "team_abbr,season,league", ignoreDuplicates: false });
          if (error) throw error;
          meta.provider = "sdio";
          meta.teams_upserted = records.length;
        }
      }

    // ─── box_scores ───
    } else if (mode === "box_scores") {

      // Try BDL first for NBA
      if (isNBA && bdlHeaders) {
        try {
          console.log(`[fetch-stats] Using BDL for NBA box scores on ${date}`);

          // Try /v1/box_scores first (structured by game)
          let usedFlatStats = false;
          const resp = await fetch(`${BDL_BASE}/v1/box_scores?date=${date}`, { headers: bdlHeaders });

          if (resp.ok) {
            const boxData = await resp.json();
            const games: any[] = boxData.data || [];

            if (games.length > 0) {
              meta.provider = "balldontlie";
              meta.box_scores_processed = games.length;

              let playerStatsCount = 0;
              let teamStatsCount = 0;
              let quartersCount = 0;

              for (const g of games) {
                const homeAbbr = g.home_team?.abbreviation ?? "";
                const awayAbbr = g.visitor_team?.abbreviation ?? "";
                const gameDate = g.date ? g.date.split("T")[0] : date;

                const { data: dbGame } = await supabase
                  .from("games")
                  .select("id")
                  .eq("league", "NBA")
                  .eq("home_abbr", homeAbbr)
                  .eq("away_abbr", awayAbbr)
                  .gte("start_time", gameDate + "T00:00:00Z")
                  .lte("start_time", gameDate + "T23:59:59Z")
                  .maybeSingle();

                if (!dbGame) continue;
                const gameKey = dbGame.id;

                const homeScore = g.home_team_score ?? null;
                const awayScore = g.visitor_team_score ?? null;
                const status = g.status === "Final" ? "final" : g.period > 0 ? "live" : "scheduled";

                await supabase.from("games").update({
                  home_score: homeScore,
                  away_score: awayScore,
                  status,
                  updated_at: new Date().toISOString(),
                }).eq("id", gameKey);

                if (g.home_team_periods && Array.isArray(g.home_team_periods)) {
                  for (let i = 0; i < g.home_team_periods.length; i++) {
                    await supabase.from("game_quarters").upsert({
                      game_id: gameKey,
                      quarter: i + 1,
                      home_score: g.home_team_periods[i],
                      away_score: g.visitor_team_periods?.[i] ?? null,
                    }, { onConflict: "game_id,quarter" });
                    quartersCount++;
                  }
                }

                const allPlayers = [
                  ...(g.home_team?.players || []).map((p: any) => ({ ...p, teamAbbr: homeAbbr })),
                  ...(g.visitor_team?.players || []).map((p: any) => ({ ...p, teamAbbr: awayAbbr })),
                ];

                for (const p of allPlayers) {
                  const playerName = `${p.player?.first_name || ""} ${p.player?.last_name || ""}`.trim();
                  if (!playerName) continue;

                  const { data: internalPlayer } = await supabase
                    .from("players")
                    .select("id")
                    .eq("name", playerName)
                    .eq("league", "NBA")
                    .maybeSingle();

                  if (internalPlayer) {
                    await supabase.from("player_game_stats").upsert({
                      player_id: internalPlayer.id,
                      game_id: gameKey,
                      team_abbr: p.teamAbbr,
                      period: "full",
                      points: p.pts ?? 0,
                      rebounds: p.reb ?? 0,
                      assists: p.ast ?? 0,
                      steals: p.stl ?? 0,
                      blocks: p.blk ?? 0,
                      turnovers: p.turnover ?? 0,
                      minutes: p.min ? parseFloat(p.min) : 0,
                      fg_made: p.fgm ?? 0,
                      fg_attempted: p.fga ?? 0,
                      three_made: p.fg3m ?? 0,
                      three_attempted: p.fg3a ?? 0,
                      ft_made: p.ftm ?? 0,
                      ft_attempted: p.fta ?? 0,
                    }, { onConflict: "player_id,game_id,period" });
                    playerStatsCount++;
                  }
                }

                for (const side of [
                  { abbr: homeAbbr, players: g.home_team?.players || [], isHome: true },
                  { abbr: awayAbbr, players: g.visitor_team?.players || [], isHome: false },
                ]) {
                  const pts = side.players.reduce((s: number, p: any) => s + (p.pts ?? 0), 0);
                  const reb = side.players.reduce((s: number, p: any) => s + (p.reb ?? 0), 0);
                  const ast = side.players.reduce((s: number, p: any) => s + (p.ast ?? 0), 0);
                  const stl = side.players.reduce((s: number, p: any) => s + (p.stl ?? 0), 0);
                  const blk = side.players.reduce((s: number, p: any) => s + (p.blk ?? 0), 0);
                  const tov = side.players.reduce((s: number, p: any) => s + (p.turnover ?? 0), 0);
                  const fgm = side.players.reduce((s: number, p: any) => s + (p.fgm ?? 0), 0);
                  const fga = side.players.reduce((s: number, p: any) => s + (p.fga ?? 0), 0);
                  const fg3m = side.players.reduce((s: number, p: any) => s + (p.fg3m ?? 0), 0);
                  const fg3a = side.players.reduce((s: number, p: any) => s + (p.fg3a ?? 0), 0);
                  const ftm = side.players.reduce((s: number, p: any) => s + (p.ftm ?? 0), 0);
                  const fta = side.players.reduce((s: number, p: any) => s + (p.fta ?? 0), 0);
                  const oreb = side.players.reduce((s: number, p: any) => s + (p.oreb ?? 0), 0);
                  const dreb = side.players.reduce((s: number, p: any) => s + (p.dreb ?? 0), 0);

                  await supabase.from("team_game_stats").upsert({
                    game_id: gameKey,
                    team_abbr: side.abbr,
                    is_home: side.isHome,
                    points: pts, rebounds: reb, assists: ast,
                    steals: stl, blocks: blk, turnovers: tov,
                    fg_made: fgm, fg_attempted: fga,
                    three_made: fg3m, three_attempted: fg3a,
                    ft_made: ftm, ft_attempted: fta,
                    off_rebounds: oreb, def_rebounds: dreb,
                  }, { onConflict: "game_id,team_abbr" });
                  teamStatsCount++;
                }
              }

              meta.player_stats = playerStatsCount;
              meta.team_stats = teamStatsCount;
              meta.quarters = quartersCount;

            } else {
              // box_scores returned empty — try flat /v1/stats endpoint
              usedFlatStats = true;
            }
          } else {
            console.warn(`[fetch-stats] BDL /v1/box_scores HTTP ${resp.status}, trying /v1/stats`);
            usedFlatStats = true;
          }

          // ─── Flat /v1/stats fallback ───
          if (usedFlatStats) {
            console.log(`[fetch-stats] Using BDL /v1/stats flat format for ${date}`);

            // Fetch all games for that date first
            const gamesResp = await fetch(
              `${BDL_BASE}/v1/games?dates[]=${date}&per_page=100`,
              { headers: bdlHeaders }
            );
            const gamesData = gamesResp.ok ? await gamesResp.json() : { data: [] };
            const bdlGames: any[] = gamesData.data || [];

            let playerStatsCount = 0;
            let quartersCount = 0;

            for (const bdlGame of bdlGames) {
              const homeAbbr = bdlGame.home_team?.abbreviation ?? "";
              const awayAbbr = bdlGame.visitor_team?.abbreviation ?? "";
              const gameDate2 = bdlGame.date?.split("T")[0] || date;

              const { data: dbGame } = await supabase
                .from("games").select("id")
                .eq("league", "NBA").eq("home_abbr", homeAbbr).eq("away_abbr", awayAbbr)
                .gte("start_time", gameDate2 + "T00:00:00Z")
                .lte("start_time", gameDate2 + "T23:59:59Z")
                .maybeSingle();
              if (!dbGame) continue;
              const gameKey = dbGame.id;

              // Update scores
              const status = bdlGame.status === "Final" ? "final" : (bdlGame.period ?? 0) > 0 ? "live" : "scheduled";
              await supabase.from("games").update({
                home_score: bdlGame.home_team_score,
                away_score: bdlGame.visitor_team_score,
                status,
                updated_at: new Date().toISOString(),
              }).eq("id", gameKey);

              // Quarter scores from game object
              for (const [qKey, qNum] of [["home_q1", 1], ["home_q2", 2], ["home_q3", 3], ["home_q4", 4]] as [string, number][]) {
                const hKey = `home_q${qNum}`;
                const vKey = `visitor_q${qNum}`;
                if (bdlGame[hKey] != null && bdlGame[vKey] != null) {
                  await supabase.from("game_quarters").upsert({
                    game_id: gameKey,
                    quarter: qNum,
                    home_score: bdlGame[hKey],
                    away_score: bdlGame[vKey],
                  }, { onConflict: "game_id,quarter" });
                  quartersCount++;
                }
              }

              // Fetch stats for this game
              const statsResp = await fetch(
                `${BDL_BASE}/v1/stats?game_ids[]=${bdlGame.id}&per_page=100`,
                { headers: bdlHeaders }
              );
              if (!statsResp.ok) continue;
              const statsData = await statsResp.json();
              const statRows: any[] = statsData.data || [];

              for (const row of statRows) {
                const playerName = `${row.player?.first_name || ""} ${row.player?.last_name || ""}`.trim();
                if (!playerName) continue;
                const teamAbbr = row.team?.abbreviation || "";

                let { data: pl } = await supabase
                  .from("players").select("id")
                  .eq("name", playerName).eq("league", "NBA")
                  .maybeSingle();

                if (!pl) {
                  const { data: newPl } = await supabase.from("players").insert({
                    name: playerName,
                    team: teamAbbr,
                    position: row.player?.position || "",
                    league: "NBA",
                  }).select("id").single();
                  pl = newPl;
                }
                if (!pl) continue;

                await supabase.from("player_game_stats").upsert({
                  player_id: pl.id,
                  game_id: gameKey,
                  team_abbr: teamAbbr,
                  period: "full",
                  points: row.pts ?? 0,
                  rebounds: row.reb ?? 0,
                  assists: row.ast ?? 0,
                  steals: row.stl ?? 0,
                  blocks: row.blk ?? 0,
                  turnovers: row.turnover ?? 0,
                  minutes: row.min ? parseFloat(row.min) : 0,
                  fg_made: row.fgm ?? 0,
                  fg_attempted: row.fga ?? 0,
                  three_made: row.fg3m ?? 0,
                  three_attempted: row.fg3a ?? 0,
                  ft_made: row.ftm ?? 0,
                  ft_attempted: row.fta ?? 0,
                  off_rebounds: row.oreb ?? 0,
                  def_rebounds: row.dreb ?? 0,
                  plus_minus: row.plus_minus ?? 0,
                }, { onConflict: "player_id,game_id,period" });
                playerStatsCount++;
              }
            }

            meta.provider = "balldontlie-flat";
            meta.games_processed = bdlGames.length;
            meta.player_stats = playerStatsCount;
            meta.quarters = quartersCount;
          }

        } catch (e) {
          console.warn("[fetch-stats] BDL box_scores failed, trying SDIO:", e);
          meta.bdl_error = String(e);
          await fetchBoxScoresSDIO(supabase, league, date, sdioKey, meta);
        }
      } else {
        await fetchBoxScoresSDIO(supabase, league, date, sdioKey, meta);
      }

    // ─── schedules (SDIO only) ───
    } else if (mode === "schedules") {
      if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured for schedules");
      const slug = league.toLowerCase();
      const resp = await fetch(`${SDIO_API_BASE}/${slug}/scores/json/Games/${season}?key=${sdioKey}`);
      if (!resp.ok) throw new Error(`Schedules error: ${resp.status}`);
      const games = await resp.json();

      const { data: stadiums } = await supabase
        .from("stadiums")
        .select("team_abbr, name")
        .eq("league", league);
      const stadiumMap = new Map((stadiums || []).map((s: any) => [s.team_abbr, s.name]));

      const records = games
        .filter((g: any) => g.DateTime || g.Day)
        .map((g: any) => ({
          external_id: `sdio_${g.GameID}`,
          league,
          home_team: g.HomeTeam ? `${g.HomeTeam}` : "",
          away_team: g.AwayTeam ? `${g.AwayTeam}` : "",
          home_abbr: g.HomeTeam || "",
          away_abbr: g.AwayTeam || "",
          start_time: g.DateTime || g.Day,
          status: g.Status === "Final" ? "final" : g.Status === "InProgress" ? "live" : "scheduled",
          venue: stadiumMap.get(g.HomeTeam) || null,
          home_score: g.HomeTeamScore || null,
          away_score: g.AwayTeamScore || null,
        }));

      const BATCH = 100;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase
          .from("games")
          .upsert(batch, { onConflict: "external_id", ignoreDuplicates: false });
        if (error) console.error(`Batch ${i} error:`, error);
      }
      meta.schedules_upserted = records.length;
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

// ── SDIO Box Scores fallback ──
async function fetchBoxScoresSDIO(
  supabase: any, league: string, date: string,
  sdioKey: string | undefined, meta: Record<string, any>
) {
  if (!sdioKey) throw new Error("SPORTSDATAIO_API_KEY not configured");
  const slug = league.toLowerCase();
  const resp = await fetch(`${SDIO_API_BASE}/${slug}/stats/json/BoxScores/${date}?key=${sdioKey}`);
  if (!resp.ok) throw new Error(`Box scores error: ${resp.status}`);
  const boxScores = await resp.json();
  meta.provider = "sdio";

  let playerStatsCount = 0;
  let teamStatsCount = 0;
  let quartersCount = 0;

  for (const box of boxScores) {
    const game = box.Game;
    if (!game) continue;

    const externalId = `sdio_${game.GameID}`;
    let { data: dbGame } = await supabase
      .from("games").select("id").eq("external_id", externalId).maybeSingle();

    if (!dbGame) {
      const startTime = new Date(game.DateTime);
      const timeBefore = new Date(startTime.getTime() - 3600000).toISOString();
      const timeAfter = new Date(startTime.getTime() + 3600000).toISOString();
      const { data: matched } = await supabase
        .from("games").select("id")
        .eq("home_abbr", game.HomeTeam).eq("away_abbr", game.AwayTeam)
        .gte("start_time", timeBefore).lte("start_time", timeAfter)
        .maybeSingle();
      dbGame = matched;
    }
    if (!dbGame) continue;
    const gameId = dbGame.id;

    if (game.HomeTeamScore != null) {
      await supabase.from("games").update({
        home_score: game.HomeTeamScore,
        away_score: game.AwayTeamScore,
        status: game.Status === "Final" ? "final" : game.Status === "InProgress" ? "live" : "scheduled",
      }).eq("id", gameId);
    }

    for (const q of box.Quarters || []) {
      await supabase.from("game_quarters").upsert({
        game_id: gameId, quarter: q.Number,
        home_score: q.HomeScore || 0, away_score: q.AwayScore || 0,
      }, { onConflict: "game_id,quarter" });
      quartersCount++;
    }

    for (const ts of box.TeamGames || []) {
      await supabase.from("team_game_stats").upsert({
        game_id: gameId, team_abbr: ts.Team, is_home: ts.HomeOrAway === "HOME",
        points: ts.Points || 0, rebounds: ts.Rebounds || 0, assists: ts.Assists || 0,
        steals: ts.Steals || 0, blocks: ts.BlockedShots || 0, turnovers: ts.Turnovers || 0,
        fg_made: ts.FieldGoalsMade || 0, fg_attempted: ts.FieldGoalsAttempted || 0,
        three_made: ts.ThreePointersMade || 0, three_attempted: ts.ThreePointersAttempted || 0,
        ft_made: ts.FreeThrowsMade || 0, ft_attempted: ts.FreeThrowsAttempted || 0,
        off_rebounds: ts.OffensiveRebounds || 0, def_rebounds: ts.DefensiveRebounds || 0,
        fast_break_points: ts.FastBreakPoints || 0, points_in_paint: ts.PointsInPaint || 0,
        bench_points: ts.BenchPoints || 0, second_chance_points: ts.SecondChancePoints || 0,
        off_rating: ts.OffensiveRating || null, def_rating: ts.DefensiveRating || null,
        pace: ts.Pace || null, possessions: ts.Possessions || null,
      }, { onConflict: "game_id,team_abbr" });
      teamStatsCount++;
    }

    const playerExternalIds = (box.PlayerGames || []).map((p: any) => String(p.PlayerID));
    const { data: playerRows } = await supabase
      .from("players").select("id, external_id").in("external_id", playerExternalIds);
    const idMap = new Map<string, string>();
    for (const row of playerRows || []) idMap.set(row.external_id!, row.id);

    for (const ps of box.PlayerGames || []) {
      const playerId = idMap.get(String(ps.PlayerID));
      if (!playerId) continue;
      await supabase.from("player_game_stats").upsert({
        game_id: gameId, player_id: playerId, team_abbr: ps.Team,
        starter: ps.Started === 1, minutes: ps.Minutes || null, period: "full",
        points: ps.Points || 0, rebounds: ps.Rebounds || 0, assists: ps.Assists || 0,
        steals: ps.Steals || 0, blocks: ps.BlockedShots || 0, turnovers: ps.Turnovers || 0,
        fouls: ps.PersonalFouls || 0,
        fg_made: ps.FieldGoalsMade || 0, fg_attempted: ps.FieldGoalsAttempted || 0,
        three_made: ps.ThreePointersMade || 0, three_attempted: ps.ThreePointersAttempted || 0,
        ft_made: ps.FreeThrowsMade || 0, ft_attempted: ps.FreeThrowsAttempted || 0,
        off_rebounds: ps.OffensiveRebounds || 0, def_rebounds: ps.DefensiveRebounds || 0,
        plus_minus: ps.PlusMinus || 0, fantasy_points: ps.FantasyPoints || null,
      }, { onConflict: "player_id,game_id,period" });
      playerStatsCount++;
    }
  }

  meta.box_scores_processed = boxScores.length;
  meta.player_stats = playerStatsCount;
  meta.team_stats = teamStatsCount;
  meta.quarters = quartersCount;
}
