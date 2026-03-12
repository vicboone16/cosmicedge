import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * ce-game-predict: Generates game-level predictions for ce_game_predictions
 * using team_season_pace data (ORtg, DRtg, Pace, Net Rating).
 * 
 * POST { game_id?: string, date?: string, league?: string }
 * - game_id: predict single game
 * - date + league: predict all games for a date
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { game_id, date, league = "NBA", model_key = "stellarline_v1" } = body;

    // Determine current season
    const now = new Date();
    const season = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;

    // Fetch games to predict
    let games: any[] = [];
    if (game_id) {
      const { data, error } = await sb.from("games").select("*").eq("id", game_id).single();
      if (error) throw new Error(`Game not found: ${error.message}`);
      games = [data];
    } else if (date) {
      const { data, error } = await sb
        .from("games")
        .select("*")
        .eq("league", league)
        .gte("start_time", `${date}T00:00:00Z`)
        .lte("start_time", `${date}T23:59:59Z`)
        .in("status", ["scheduled", "live", "in_progress"])
        .order("start_time");
      if (error) throw new Error(`Failed to fetch games: ${error.message}`);
      games = data || [];
    } else {
      throw new Error("Provide game_id or date+league");
    }

    if (!games.length) {
      return new Response(JSON.stringify({ ok: true, predictions: 0, message: "No games found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all team pace data for this league/season
    const teamAbbrs = [...new Set(games.flatMap((g: any) => [g.home_abbr, g.away_abbr]))];
    const { data: paceData } = await sb
      .from("team_season_pace")
      .select("*")
      .eq("league", league)
      .eq("season", season)
      .in("team_abbr", teamAbbrs);

    const paceMap = new Map<string, any>();
    for (const p of paceData || []) {
      paceMap.set(p.team_abbr, p);
    }

    // League averages for fallback
    const leagueDefaults: Record<string, any> = {
      NBA: { off_rating: 113.5, def_rating: 113.5, avg_pace: 100, net_rating: 0, avg_points: 112 },
      NHL: { off_rating: 3.0, def_rating: 3.0, avg_pace: 60, net_rating: 0, avg_points: 3 },
      NFL: { off_rating: 22.0, def_rating: 22.0, avg_pace: 64, net_rating: 0, avg_points: 22 },
      MLB: { off_rating: 4.5, def_rating: 4.5, avg_pace: 38, net_rating: 0, avg_points: 4.5 },
    };
    const defaults = leagueDefaults[league] || leagueDefaults.NBA;

    const predictions: any[] = [];

    for (const game of games) {
      const home = paceMap.get(game.home_abbr);
      const away = paceMap.get(game.away_abbr);

      if (!home && !away) {
        console.warn(`No pace data for ${game.home_abbr} or ${game.away_abbr}, skipping`);
        continue;
      }

      const hOrtg = home?.off_rating ?? defaults.off_rating;
      const hDrtg = home?.def_rating ?? defaults.def_rating;
      const hPace = home?.avg_pace ?? defaults.avg_pace;
      const hNet = home?.net_rating ?? defaults.net_rating;
      const aOrtg = away?.off_rating ?? defaults.off_rating;
      const aDrtg = away?.def_rating ?? defaults.def_rating;
      const aPace = away?.avg_pace ?? defaults.avg_pace;
      const aNet = away?.net_rating ?? defaults.net_rating;

      // Matchup pace: average of both teams
      const matchupPace = (hPace + aPace) / 2;

      // Expected possessions (pace is possessions per 48 min)
      const expectedPoss = matchupPace;

      // Score projections using opponent-adjusted efficiency
      // Home team scores: (homeORtg + awayDRtg) / 2 * possessions / 100
      // This averages the home team's offensive ability with the away team's defensive weakness
      const leagueAvgRtg = (league === "NBA") ? 113.5 : defaults.off_rating;
      const muHome = ((hOrtg + aDrtg) / 2) * expectedPoss / 100;
      const muAway = ((aOrtg + hDrtg) / 2) * expectedPoss / 100;

      // Home court advantage: +3 points NBA, +2.5 NFL, +0.25 NHL/MLB
      const hca = league === "NBA" ? 3.0 : league === "NFL" ? 2.5 : 0.25;
      const adjMuHome = muHome + hca / 2;
      const adjMuAway = muAway - hca / 2;

      const muTotal = adjMuHome + adjMuAway;
      const muSpread = adjMuAway - adjMuHome; // spread is from home perspective (negative = home favored)

      // Win probability using net rating differential + home court
      // Simple logistic model: P(home) = 1 / (1 + 10^(-netDiff/sigma))
      const netDiff = hNet - aNet + (hca * 0.4); // net rating diff + HCA factor
      const sigma = league === "NBA" ? 12.0 : league === "NFL" ? 14.0 : league === "NHL" ? 3.0 : 5.0;
      const pHomeWin = 1 / (1 + Math.pow(10, -netDiff / sigma));
      const pAwayWin = 1 - pHomeWin;

      // Fair moneyline conversion
      let fairMlHome: number, fairMlAway: number;
      if (pHomeWin >= 0.5) {
        fairMlHome = -Math.round((pHomeWin / (1 - pHomeWin)) * 100);
        fairMlAway = Math.round(((1 - pHomeWin) / pHomeWin) * 100);
      } else {
        fairMlHome = Math.round(((1 - pHomeWin) / pHomeWin) * 100);
        fairMlAway = -Math.round((pHomeWin / (1 - pHomeWin)) * 100);
      }

      // Blowout risk: based on net rating gap
      const blowoutRisk = Math.min(1, Math.max(0, Math.abs(hNet - aNet) / 30));

      // Check book implied probability for edge calculation
      let bookImpliedHome: number | null = null;
      let edgeHome: number | null = null;
      let edgeAway: number | null = null;

      const { data: odds } = await sb
        .from("odds_snapshots")
        .select("home_price, away_price, market_type")
        .eq("game_id", game.id)
        .eq("market_type", "moneyline")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (odds?.home_price) {
        const hp = odds.home_price;
        bookImpliedHome = hp < 0 ? Math.abs(hp) / (Math.abs(hp) + 100) : 100 / (hp + 100);
        edgeHome = Number((pHomeWin - bookImpliedHome).toFixed(4));
        edgeAway = Number((pAwayWin - (1 - bookImpliedHome)).toFixed(4));
      }

      const prediction = {
        game_id: game.id,
        model_key,
        sport: league,
        p_home_win: Number(pHomeWin.toFixed(4)),
        p_away_win: Number(pAwayWin.toFixed(4)),
        fair_ml_home: fairMlHome,
        fair_ml_away: fairMlAway,
        mu_home: Number(adjMuHome.toFixed(1)),
        mu_away: Number(adjMuAway.toFixed(1)),
        mu_total: Number(muTotal.toFixed(1)),
        mu_spread_home: Number(muSpread.toFixed(1)),
        edge_home: edgeHome,
        edge_away: edgeAway,
        blowout_risk: Number(blowoutRisk.toFixed(4)),
        expected_possessions: Number(expectedPoss.toFixed(1)),
        home_off_rtg: Number(hOrtg.toFixed(1)),
        home_def_rtg: Number(hDrtg.toFixed(1)),
        away_off_rtg: Number(aOrtg.toFixed(1)),
        away_def_rtg: Number(aDrtg.toFixed(1)),
        home_pace: Number(hPace.toFixed(1)),
        away_pace: Number(aPace.toFixed(1)),
        home_net_rating: Number(hNet.toFixed(1)),
        away_net_rating: Number(aNet.toFixed(1)),
        book_implied_home: bookImpliedHome ? Number(bookImpliedHome.toFixed(4)) : null,
        notes_json: {
          home_games: home?.games_played ?? 0,
          away_games: away?.games_played ?? 0,
          hca_applied: hca,
          sigma_used: sigma,
        },
        run_ts: new Date().toISOString(),
      };

      predictions.push(prediction);
    }

    // Upsert all predictions
    if (predictions.length > 0) {
      const { error: upsertErr } = await sb
        .from("ce_game_predictions")
        .upsert(predictions, { onConflict: "game_id,model_key" });
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      predictions: predictions.length,
      games_found: games.length,
      skipped: games.length - predictions.length,
      sample: predictions.slice(0, 3).map(p => ({
        game_id: p.game_id,
        p_home_win: p.p_home_win,
        fair_ml_home: p.fair_ml_home,
        mu_total: p.mu_total,
        edge_home: p.edge_home,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ce-game-predict error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
