import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * oracle-ml-nhl — NHL pregame score + ML predictions
 * Method: Poisson goals model (Skellam approximation for WP)
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

const HOME_ADV = 0.15;
const LEAGUE_AVG_GOALS = 3.1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const gameDate = url.searchParams.get("game_date");
    const singleGameId = url.searchParams.get("game_id");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const season = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;

    let gamesQ = sb.from("games").select("*").eq("league", "NHL").in("status", ["scheduled", "live"]);
    if (singleGameId) {
      gamesQ = sb.from("games").select("*").eq("id", singleGameId);
    } else if (gameDate) {
      gamesQ = gamesQ.gte("start_time", `${gameDate}T00:00:00Z`).lte("start_time", `${gameDate}T23:59:59Z`);
    } else {
      gamesQ = gamesQ.gte("start_time", new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte("start_time", new Date(Date.now() + 48 * 3600_000).toISOString());
    }

    const { data: games, error: gErr } = await gamesQ.limit(50);
    if (gErr) throw gErr;
    if (!games?.length) {
      return new Response(JSON.stringify({ sport: "nhl", model_name: "oracle_ml", model_version: "v1", games_processed: 0, inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allTeams = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: paceRows } = await sb.from("team_season_pace").select("*")
      .eq("season", season).eq("league", "NHL").in("team_abbr", allTeams);
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

      // Poisson goals model
      const hAvgPts = Number(hP?.avg_points) || LEAGUE_AVG_GOALS;
      const aAvgPts = Number(aP?.avg_points) || LEAGUE_AVG_GOALS;
      const hAvgAllowed = Number(hP?.avg_points_allowed) || LEAGUE_AVG_GOALS;
      const aAvgAllowed = Number(aP?.avg_points_allowed) || LEAGUE_AVG_GOALS;
      const hNet = Number(hP?.net_rating) || 0;
      const aNet = Number(aP?.net_rating) || 0;
      const hGP = hP?.games_played || 0;
      const aGP = aP?.games_played || 0;

      // Expected goals using strength factors
      const hOffStr = hAvgPts / LEAGUE_AVG_GOALS;
      const aOffStr = aAvgPts / LEAGUE_AVG_GOALS;
      const hDefStr = hAvgAllowed / LEAGUE_AVG_GOALS;
      const aDefStr = aAvgAllowed / LEAGUE_AVG_GOALS;

      const muHome = LEAGUE_AVG_GOALS * hOffStr * (2 - aDefStr) + HOME_ADV;
      const muAway = LEAGUE_AVG_GOALS * aOffStr * (2 - hDefStr);

      // Skellam approximation via normal
      const muDiff = muHome - muAway;
      const sigmaDiff = Math.sqrt(muHome + muAway);
      const pHomeWin = normCDF(muDiff / sigmaDiff);
      const pAwayWin = 1 - pHomeWin;
      const muTotal = muHome + muAway;
      const blowout = clamp(Math.abs(muDiff) / 3, 0, 1);

      const odds = oddsMap.get(game.id);
      const bookImplied = odds?.home ? americanToImplied(odds.home) : null;
      const edgeHome = bookImplied != null ? +(pHomeWin - bookImplied).toFixed(4) : null;
      const edgeAway = odds?.away ? +(pAwayWin - americanToImplied(odds.away)).toFixed(4) : null;

      // Period predictions (3 periods for NHL)
      const qtrWP: number[] = [];
      const qtrML: { home: number; away: number }[] = [];
      for (let p = 1; p <= 3; p++) {
        const muDiffP = muDiff / 3;
        const sigmaP = Math.sqrt(muTotal / 3);
        const wp = normCDF(muDiffP / Math.max(sigmaP, 0.3));
        qtrWP.push(+wp.toFixed(4));
        qtrML.push({ home: wpToML(wp), away: wpToML(1 - wp) });
      }

      rows.push({
        game_id: game.id, sport: "NHL", model_name: "oracle_ml", model_version: "v1",
        run_ts: runTs,
        mu_home: +muHome.toFixed(2), mu_away: +muAway.toFixed(2),
        mu_total: +muTotal.toFixed(2), mu_spread_home: +muDiff.toFixed(2),
        p_home_win: +pHomeWin.toFixed(4), p_away_win: +pAwayWin.toFixed(4),
        fair_ml_home: wpToML(pHomeWin), fair_ml_away: wpToML(pAwayWin),
        expected_possessions: null,
        blowout_risk: +blowout.toFixed(4),
        book_implied_home: bookImplied, edge_home: edgeHome, edge_away: edgeAway,
        p_home_win_ci_low: +clamp(pHomeWin - 0.12, 0.01, 0.99).toFixed(4),
        p_home_win_ci_high: +clamp(pHomeWin + 0.12, 0.01, 0.99).toFixed(4),
        qtr_wp_home: qtrWP, qtr_fair_ml: qtrML,
        features_json: {
          home_avg_goals: hAvgPts, home_avg_allowed: hAvgAllowed, home_gp: hGP,
          away_avg_goals: aAvgPts, away_avg_allowed: aAvgAllowed, away_gp: aGP,
          home_off_str: +hOffStr.toFixed(3), away_off_str: +aOffStr.toFixed(3),
          sigma_diff: +sigmaDiff.toFixed(3),
        },
        notes_json: {},
      });
    }

    if (rows.length > 0) {
      const { error: iErr } = await sb.from("model_game_predictions").insert(rows);
      if (iErr) console.error("Insert error:", iErr);
    }

    return new Response(JSON.stringify({
      sport: "nhl", model_name: "oracle_ml", model_version: "v1",
      games_processed: games.length, inserted: rows.length, run_ts: runTs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("oracle-ml-nhl error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
