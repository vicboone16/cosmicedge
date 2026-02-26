import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * oracle-pregame — Batch compute pregame score projections + ML for upcoming games.
 * Stores results in game_predictions table.
 * 
 * Params: ?league=NBA (optional, defaults to all)
 */

// ── Math helpers (mirror of client-side oracle-engine) ──────────────────────

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

function wpToAmericanOdds(wp: number): number {
  wp = clamp(wp, 0.01, 0.99);
  return wp >= 0.5 ? Math.round(-100 * wp / (1 - wp)) : Math.round(100 * (1 - wp) / wp);
}

function americanToImplied(odds: number): number {
  if (!odds || odds === 0) return 0;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

const SPORT_DEFAULTS: Record<string, { homeAdv: number; sigma: number }> = {
  NBA: { homeAdv: 3.0, sigma: 12.5 },
  NFL: { homeAdv: 2.5, sigma: 13.5 },
  NHL: { homeAdv: 0.15, sigma: 1.6 },
  MLB: { homeAdv: 0.25, sigma: 2.8 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const leagueFilter = url.searchParams.get("league");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Get current season
    const now = new Date();
    const season = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;

    // Fetch upcoming/live games
    const gamesQuery = sb.from("games").select("*")
      .in("status", ["scheduled", "live"])
      .gte("start_time", new Date(Date.now() - 2 * 3600_000).toISOString())
      .lte("start_time", new Date(Date.now() + 48 * 3600_000).toISOString());
    
    if (leagueFilter) gamesQuery.eq("league", leagueFilter);
    const { data: games, error: gErr } = await gamesQuery.limit(100);
    if (gErr) throw gErr;
    if (!games?.length) {
      return new Response(JSON.stringify({ ok: true, predictions: 0, message: "No upcoming games" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all team pace data for current season
    const allTeams = [...new Set(games.flatMap(g => [g.home_abbr, g.away_abbr]))];
    const { data: paceRows } = await sb.from("team_season_pace").select("*")
      .eq("season", season).in("team_abbr", allTeams);
    
    const paceMap = new Map<string, any>();
    for (const r of paceRows || []) paceMap.set(r.team_abbr, r);

    // Fetch current odds for edge calculation
    const gameIds = games.map(g => g.id);
    const { data: oddsRows } = await sb.from("odds_snapshots").select("game_id, market_type, home_price, away_price")
      .in("game_id", gameIds).eq("market_type", "moneyline");
    const oddsMap = new Map<string, { home: number; away: number }>();
    for (const o of oddsRows || []) {
      if (!oddsMap.has(o.game_id)) oddsMap.set(o.game_id, { home: o.home_price, away: o.away_price });
    }

    // Compute predictions
    const predictions: any[] = [];

    for (const game of games) {
      const hPace = paceMap.get(game.home_abbr);
      const aPace = paceMap.get(game.away_abbr);
      if (!hPace && !aPace) continue;

      const sport = game.league;
      const defs = SPORT_DEFAULTS[sport] || SPORT_DEFAULTS.NBA;
      
      const hOff = Number(hPace?.off_rating) || 110;
      const hDef = Number(hPace?.def_rating) || 110;
      const aOff = Number(aPace?.off_rating) || 110;
      const aDef = Number(aPace?.def_rating) || 110;
      const hPaceVal = Number(hPace?.avg_pace) || 100;
      const aPaceVal = Number(aPace?.avg_pace) || 100;
      const hNet = Number(hPace?.net_rating) || 0;
      const aNet = Number(aPace?.net_rating) || 0;
      const hGP = hPace?.games_played || 0;
      const aGP = aPace?.games_played || 0;

      const matchupPace = (hPaceVal + aPaceVal) / 2;
      const leagueAvgRtg = 110;

      let muHome: number, muAway: number;
      
      if (sport === "NHL" || sport === "MLB") {
        const leagueAvg = sport === "NHL" ? 3.1 : 4.5;
        muHome = leagueAvg * (hOff / 100) * (2 - aDef / 100) + defs.homeAdv;
        muAway = leagueAvg * (aOff / 100) * (2 - hDef / 100);
      } else {
        const homeOE = hOff + (aDef - leagueAvgRtg);
        const awayOE = aOff + (hDef - leagueAvgRtg);
        muHome = (matchupPace * homeOE / 100) + (defs.homeAdv / 2);
        muAway = (matchupPace * awayOE / 100) - (defs.homeAdv / 2);
      }

      const muTotal = muHome + muAway;
      const muSpread = muHome - muAway;
      const sigma = (sport === "NHL" || sport === "MLB") 
        ? Math.sqrt(muHome + muAway) 
        : defs.sigma;
      const pHomeWin = normCDF(muSpread / Math.max(sigma, 0.5));
      const pAwayWin = 1 - pHomeWin;
      const blowoutRisk = clamp(Math.abs(hNet - aNet) / 30, 0, 1);

      const odds = oddsMap.get(game.id);
      const bookImplied = odds?.home ? americanToImplied(odds.home) : null;
      const edgeHome = bookImplied != null ? +(pHomeWin - bookImplied).toFixed(4) : null;
      const edgeAway = odds?.away ? +(pAwayWin - americanToImplied(odds.away)).toFixed(4) : null;

      predictions.push({
        game_id: game.id,
        model_key: "oracle_v1",
        sport,
        run_ts: new Date().toISOString(),
        mu_home: +muHome.toFixed(1),
        mu_away: +muAway.toFixed(1),
        mu_total: +muTotal.toFixed(1),
        mu_spread_home: +muSpread.toFixed(1),
        p_home_win: +pHomeWin.toFixed(4),
        p_away_win: +pAwayWin.toFixed(4),
        fair_ml_home: wpToAmericanOdds(pHomeWin),
        fair_ml_away: wpToAmericanOdds(pAwayWin),
        home_off_rtg: hOff,
        home_def_rtg: hDef,
        away_off_rtg: aOff,
        away_def_rtg: aDef,
        home_pace: hPaceVal,
        away_pace: aPaceVal,
        expected_possessions: +matchupPace.toFixed(1),
        blowout_risk: +blowoutRisk.toFixed(4),
        book_implied_home: bookImplied,
        edge_home: edgeHome,
        edge_away: edgeAway,
        is_live: false,
        updated_at: new Date().toISOString(),
      });
    }

    // Upsert predictions
    if (predictions.length > 0) {
      const { error: uErr } = await sb.from("game_predictions").upsert(predictions, {
        onConflict: "game_id,model_key,is_live",
      });
      if (uErr) console.error("Upsert error:", uErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      predictions: predictions.length,
      games_checked: games.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("oracle-pregame error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
