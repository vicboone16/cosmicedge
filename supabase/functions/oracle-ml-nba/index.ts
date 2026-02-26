import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * oracle-ml-nba — NBA pregame score + ML predictions
 * Method: Pace × Efficiency (Normal margin approximation)
 * Writes to model_game_predictions (never overwrites)
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

const HOME_ADV = 3.0;
const SIGMA_BASE = 12.5;
const LEAGUE_AVG_RTG = 110;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const gameDate = url.searchParams.get("game_date");
    const singleGameId = url.searchParams.get("game_id");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const season = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;

    // Fetch games
    let gamesQ = sb.from("games").select("*").eq("league", "NBA")
      .in("status", ["scheduled", "live"]);

    if (singleGameId) {
      gamesQ = sb.from("games").select("*").eq("id", singleGameId);
    } else if (gameDate) {
      gamesQ = gamesQ.gte("start_time", `${gameDate}T00:00:00Z`)
        .lte("start_time", `${gameDate}T23:59:59Z`);
    } else {
      gamesQ = gamesQ
        .gte("start_time", new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte("start_time", new Date(Date.now() + 48 * 3600_000).toISOString());
    }

    const { data: games, error: gErr } = await gamesQ.limit(100);
    if (gErr) throw gErr;
    if (!games?.length) {
      return new Response(JSON.stringify({ sport: "nba", model_name: "oracle_ml", model_version: "v1", games_processed: 0, inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch team ratings
    const allTeams = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: paceRows } = await sb.from("team_season_pace").select("*")
      .eq("season", season).eq("league", "NBA").in("team_abbr", allTeams);
    const paceMap = new Map<string, any>();
    for (const r of paceRows || []) paceMap.set(r.team_abbr, r);

    // Fetch odds for edge calc
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
      if (!hP && !aP) continue;

      const hOff = Number(hP?.off_rating) || 110;
      const hDef = Number(hP?.def_rating) || 110;
      const aOff = Number(aP?.off_rating) || 110;
      const aDef = Number(aP?.def_rating) || 110;
      const hPace = Number(hP?.avg_pace) || 100;
      const aPace = Number(aP?.avg_pace) || 100;
      const hNet = Number(hP?.net_rating) || 0;
      const aNet = Number(aP?.net_rating) || 0;
      const hGP = hP?.games_played || 0;
      const aGP = aP?.games_played || 0;

      const matchupPace = (hPace + aPace) / 2;
      const homeOE = hOff + (aDef - LEAGUE_AVG_RTG);
      const awayOE = aOff + (hDef - LEAGUE_AVG_RTG);
      const muHome = (matchupPace * homeOE / 100) + (HOME_ADV / 2);
      const muAway = (matchupPace * awayOE / 100) - (HOME_ADV / 2);
      const muTotal = muHome + muAway;
      const muSpread = muHome - muAway;

      const dataFactor = Math.min(1, Math.max(0.7, 1 - (Math.min(hGP, aGP) - 5) * 0.01));
      const sigma = SIGMA_BASE * dataFactor;
      const pHomeWin = normCDF(muSpread / sigma);
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
        const sigmaQ = sigma / Math.sqrt(4) * 0.8;
        const wp = normCDF(muDiffQ / Math.max(sigmaQ, 0.5));
        qtrWP.push(+wp.toFixed(4));
        qtrML.push({ home: wpToML(wp), away: wpToML(1 - wp) });
      }

      rows.push({
        game_id: game.id,
        sport: "NBA",
        model_name: "oracle_ml",
        model_version: "v1",
        run_ts: runTs,
        mu_home: +muHome.toFixed(1),
        mu_away: +muAway.toFixed(1),
        mu_total: +muTotal.toFixed(1),
        mu_spread_home: +muSpread.toFixed(1),
        p_home_win: +pHomeWin.toFixed(4),
        p_away_win: +pAwayWin.toFixed(4),
        fair_ml_home: wpToML(pHomeWin),
        fair_ml_away: wpToML(pAwayWin),
        expected_possessions: +matchupPace.toFixed(1),
        blowout_risk: +blowout.toFixed(4),
        book_implied_home: bookImplied,
        edge_home: edgeHome,
        edge_away: edgeAway,
        p_home_win_ci_low: +clamp(pHomeWin - 0.1, 0.01, 0.99).toFixed(4),
        p_home_win_ci_high: +clamp(pHomeWin + 0.1, 0.01, 0.99).toFixed(4),
        qtr_wp_home: qtrWP,
        qtr_fair_ml: qtrML,
        features_json: {
          home_off_rtg: hOff, home_def_rtg: hDef, home_pace: hPace, home_net: hNet, home_gp: hGP,
          away_off_rtg: aOff, away_def_rtg: aDef, away_pace: aPace, away_net: aNet, away_gp: aGP,
          matchup_pace: matchupPace, sigma, data_factor: dataFactor,
        },
        notes_json: {},
      });
    }

    if (rows.length > 0) {
      const { error: iErr } = await sb.from("model_game_predictions").insert(rows);
      if (iErr) console.error("Insert error:", iErr);
    }

    return new Response(JSON.stringify({
      sport: "nba", model_name: "oracle_ml", model_version: "v1",
      games_processed: games.length, inserted: rows.length, run_ts: runTs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("oracle-ml-nba error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
