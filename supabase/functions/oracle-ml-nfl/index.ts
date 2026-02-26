import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * oracle-ml-nfl — NFL pregame score + ML predictions
 * Method: Drives × Points/Drive (Normal margin approximation)
 */

function normCDF(z: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const x = Math.abs(z);
  const t = 1.0 / (1.0 + 0.2316419 * x);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const approx = 1.0 - 0.3989422804014327 * Math.exp(-0.5 * x * x) * poly;
  return z < 0 ? 1.0 - approx : approx;
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function wpToML(wp: number): number {
  wp = clamp(wp, 0.01, 0.99);
  return wp >= 0.5 ? Math.round(-100 * wp / (1 - wp)) : Math.round(100 * (1 - wp) / wp);
}

function americanToImplied(odds: number): number {
  if (!odds || odds === 0) return 0;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

const HOME_ADV = 2.5;
const SIGMA = 13.5;
const AVG_DRIVES = 11.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const gameDate = url.searchParams.get("game_date");
    const singleGameId = url.searchParams.get("game_id");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const season = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;

    let gamesQ = sb.from("games").select("*").eq("league", "NFL").in("status", ["scheduled", "live"]);
    if (singleGameId) {
      gamesQ = sb.from("games").select("*").eq("id", singleGameId);
    } else if (gameDate) {
      gamesQ = gamesQ.gte("start_time", `${gameDate}T00:00:00Z`).lte("start_time", `${gameDate}T23:59:59Z`);
    } else {
      gamesQ = gamesQ.gte("start_time", new Date(Date.now() - 6 * 3600_000).toISOString())
        .lte("start_time", new Date(Date.now() + 168 * 3600_000).toISOString()); // 1 week ahead for NFL
    }

    const { data: games, error: gErr } = await gamesQ.limit(50);
    if (gErr) throw gErr;
    if (!games?.length) {
      return new Response(JSON.stringify({ sport: "nfl", model_name: "oracle_ml", model_version: "v1", games_processed: 0, inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allTeams = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: paceRows } = await sb.from("team_season_pace").select("*")
      .eq("season", season).eq("league", "NFL").in("team_abbr", allTeams);
    const paceMap = new Map<string, any>();
    for (const r of paceRows || []) paceMap.set(r.team_abbr, r);

    const gameIds = games.map(g => g.id);
    const { data: oddsRows } = await sb.from("odds_snapshots").select("game_id, home_price, away_price")
      .in("game_id", gameIds).eq("market_type", "moneyline");
    const oddsMap = new Map<string, { home: number; away: number }>();
    for (const o of oddsRows || []) {
      if (!oddsMap.has(o.game_id)) oddsMap.set(o.game_id, { home: o.home_price, away: o.away_price });
    }

    const runTs = new Date().toISOString();
    const rows: any[] = [];

    for (const game of games) {
      const hP = paceMap.get(game.home_abbr);
      const aP = paceMap.get(game.away_abbr);

      // NFL: Use points-per-drive style. If no pace data, use avg_points as proxy.
      const hAvgPts = Number(hP?.avg_points) || 22;
      const aAvgPts = Number(aP?.avg_points) || 22;
      const hAvgAllowed = Number(hP?.avg_points_allowed) || 22;
      const aAvgAllowed = Number(aP?.avg_points_allowed) || 22;
      const hNet = Number(hP?.net_rating) || 0;
      const aNet = Number(aP?.net_rating) || 0;
      const hGP = hP?.games_played || 0;
      const aGP = aP?.games_played || 0;
      const hPace = Number(hP?.avg_pace) || 60;
      const aPace = Number(aP?.avg_pace) || 60;

      // Predicted scores: average of team's offense vs opponent's defense
      const muHome = (hAvgPts + aAvgAllowed) / 2 + (HOME_ADV / 2);
      const muAway = (aAvgPts + hAvgAllowed) / 2 - (HOME_ADV / 2);
      const muTotal = muHome + muAway;
      const muSpread = muHome - muAway;

      const pHomeWin = normCDF(muSpread / SIGMA);
      const pAwayWin = 1 - pHomeWin;
      const blowout = clamp(Math.abs(hNet - aNet) / 30, 0, 1);

      const odds = oddsMap.get(game.id);
      const bookImplied = odds?.home ? americanToImplied(odds.home) : null;
      const edgeHome = bookImplied != null ? +(pHomeWin - bookImplied).toFixed(4) : null;
      const edgeAway = odds?.away ? +(pAwayWin - americanToImplied(odds.away)).toFixed(4) : null;

      // Quarter predictions
      const qtrWP: number[] = [];
      const qtrML: { home: number; away: number }[] = [];
      for (let q = 1; q <= 4; q++) {
        const qFactor = q === 1 ? 1.05 : q === 4 ? 0.95 : 1.0;
        const muDiffQ = (muSpread / 4) * qFactor;
        const sigmaQ = SIGMA / Math.sqrt(4) * 0.8;
        const wp = normCDF(muDiffQ / Math.max(sigmaQ, 0.5));
        qtrWP.push(+wp.toFixed(4));
        qtrML.push({ home: wpToML(wp), away: wpToML(1 - wp) });
      }

      rows.push({
        game_id: game.id, sport: "NFL", model_name: "oracle_ml", model_version: "v1",
        run_ts: runTs,
        mu_home: +muHome.toFixed(1), mu_away: +muAway.toFixed(1),
        mu_total: +muTotal.toFixed(1), mu_spread_home: +muSpread.toFixed(1),
        p_home_win: +pHomeWin.toFixed(4), p_away_win: +pAwayWin.toFixed(4),
        fair_ml_home: wpToML(pHomeWin), fair_ml_away: wpToML(pAwayWin),
        expected_possessions: +((hPace + aPace) / 2).toFixed(1),
        blowout_risk: +blowout.toFixed(4),
        book_implied_home: bookImplied, edge_home: edgeHome, edge_away: edgeAway,
        p_home_win_ci_low: +clamp(pHomeWin - 0.12, 0.01, 0.99).toFixed(4),
        p_home_win_ci_high: +clamp(pHomeWin + 0.12, 0.01, 0.99).toFixed(4),
        qtr_wp_home: qtrWP, qtr_fair_ml: qtrML,
        features_json: {
          home_avg_pts: hAvgPts, home_avg_allowed: hAvgAllowed, home_gp: hGP, home_pace: hPace,
          away_avg_pts: aAvgPts, away_avg_allowed: aAvgAllowed, away_gp: aGP, away_pace: aPace,
          sigma: SIGMA,
        },
        notes_json: {},
      });
    }

    if (rows.length > 0) {
      const { error: iErr } = await sb.from("model_game_predictions").insert(rows);
      if (iErr) console.error("Insert error:", iErr);
    }

    return new Response(JSON.stringify({
      sport: "nfl", model_name: "oracle_ml", model_version: "v1",
      games_processed: games.length, inserted: rows.length, run_ts: runTs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("oracle-ml-nfl error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
