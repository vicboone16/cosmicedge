import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Utility Functions ── */

function estimatePossessions(fga: number, fta: number, orb: number, tov: number): number {
  return fga + 0.44 * fta - orb + tov;
}

/* ── Team Models ── */

function computeFourFactors(team: any, opp: any) {
  const fga = team.fg_attempted || 1;
  const tpm = team.three_made || 0;
  const fgm = team.fg_made || 0;
  const fta = team.ft_attempted || 0;
  const ftm = team.ft_made || 0;
  const tov = team.turnovers || 0;
  const orb = team.off_rebounds || 0;
  const drb = opp.def_rebounds || opp.rebounds ? (opp.rebounds || 0) - (opp.off_rebounds || 0) : 20;

  const efg = (fgm + 0.5 * tpm) / fga;
  const tovRate = tov / (fga + 0.44 * fta + tov || 1);
  const orbRate = orb / (orb + drb || 1);
  const ftRate = ftm / (fga || 1);

  return {
    model_id: "four_factors",
    scope: "team",
    metrics: [
      { name: "eFG%", value: +(efg * 100).toFixed(1), unit: "%" },
      { name: "TOV%", value: +(tovRate * 100).toFixed(1), unit: "%" },
      { name: "ORB%", value: +(orbRate * 100).toFixed(1), unit: "%" },
      { name: "FT Rate", value: +(ftRate * 100).toFixed(1), unit: "%" },
    ],
    signal: scoreFromFourFactors(efg, tovRate, orbRate, ftRate),
    summary: `eFG ${(efg * 100).toFixed(1)}%, TOV ${(tovRate * 100).toFixed(1)}%, ORB ${(orbRate * 100).toFixed(1)}%`,
  };
}

function scoreFromFourFactors(efg: number, tov: number, orb: number, ft: number) {
  // Score based on how good each factor is relative to league avg
  let s = 0;
  s += (efg - 0.50) * 4; // eFG above 50% is good
  s += (0.14 - tov) * 3; // TOV below 14% is good
  s += (orb - 0.25) * 3; // ORB above 25% is good
  s += (ft - 0.20) * 2; // FT rate above 20% is good
  const clamped = Math.max(-1, Math.min(1, s));
  return {
    direction: clamped > 0.15 ? "supports" : clamped < -0.15 ? "conflicts" : "neutral",
    strength: Math.abs(clamped) > 0.5 ? "strong" : Math.abs(clamped) > 0.2 ? "medium" : "weak",
    score: +clamped.toFixed(3),
  };
}

function computeEfficiency(team: any, opp: any) {
  const poss = estimatePossessions(
    team.fg_attempted || 80, team.ft_attempted || 20,
    team.off_rebounds || 10, team.turnovers || 14
  );
  const oppPoss = estimatePossessions(
    opp.fg_attempted || 80, opp.ft_attempted || 20,
    opp.off_rebounds || 10, opp.turnovers || 14
  );
  const pts = team.points || 100;
  const oppPts = opp.points || 100;

  const ortg = (pts / (poss || 1)) * 100;
  const drtg = (oppPts / (oppPoss || 1)) * 100;
  const net = ortg - drtg;

  const score = Math.max(-1, Math.min(1, net / 15));

  return {
    model_id: "ortg_drtg",
    scope: "team",
    metrics: [
      { name: "ORtg", value: +ortg.toFixed(1) },
      { name: "DRtg", value: +drtg.toFixed(1) },
      { name: "Net", value: +net.toFixed(1) },
    ],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `ORtg ${ortg.toFixed(1)}, DRtg ${drtg.toFixed(1)}, Net ${net > 0 ? "+" : ""}${net.toFixed(1)}`,
  };
}

function computePace(team: any, opp: any) {
  const poss = estimatePossessions(
    team.fg_attempted || 80, team.ft_attempted || 20,
    team.off_rebounds || 10, team.turnovers || 14
  );
  const oppPoss = estimatePossessions(
    opp.fg_attempted || 80, opp.ft_attempted || 20,
    opp.off_rebounds || 10, opp.turnovers || 14
  );
  const pace = (poss + oppPoss) / 2;
  const leagueAvgPace = 100;
  const diff = pace - leagueAvgPace;
  const score = Math.max(-1, Math.min(1, diff / 15));

  return {
    model_id: "pace",
    scope: "team",
    metrics: [
      { name: "Pace", value: +pace.toFixed(1), unit: "poss/game" },
      { name: "vs League Avg", value: +(diff).toFixed(1) },
    ],
    signal: {
      direction: "neutral" as const,
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `Pace ${pace.toFixed(1)} (${diff > 0 ? "+" : ""}${diff.toFixed(1)} vs avg)`,
  };
}

function computeNetRating(seasonStats: any) {
  if (!seasonStats) return null;
  const net = (seasonStats.net_rating ?? seasonStats.off_rating ?? 0) - (seasonStats.def_rating ?? 0);
  const actualNet = seasonStats.net_rating ?? net;
  const score = Math.max(-1, Math.min(1, actualNet / 10));

  return {
    model_id: "net_rating",
    scope: "team",
    metrics: [
      { name: "Net Rating", value: +actualNet.toFixed(1) },
      { name: "ORtg", value: +(seasonStats.off_rating || 0).toFixed(1) },
      { name: "DRtg", value: +(seasonStats.def_rating || 0).toFixed(1) },
    ],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `Season Net Rating: ${actualNet > 0 ? "+" : ""}${actualNet.toFixed(1)}`,
  };
}

/* ── Player Models ── */

function computeGameScore(p: any) {
  const gs = (p.points || 0)
    + 0.4 * (p.fg_made || 0)
    - 0.7 * (p.fg_attempted || 0)
    - 0.4 * ((p.ft_attempted || 0) - (p.ft_made || 0))
    + 0.7 * (p.off_rebounds || 0)
    + 0.3 * ((p.rebounds || 0) - (p.off_rebounds || 0))
    + (p.steals || 0)
    + 0.7 * (p.assists || 0)
    + 0.7 * (p.blocks || 0)
    - 0.4 * (p.fouls || 0)
    - (p.turnovers || 0);

  const score = Math.max(-1, Math.min(1, (gs - 10) / 20));
  return {
    model_id: "game_score",
    scope: "player",
    metrics: [
      { name: "Game Score", value: +gs.toFixed(1) },
      { name: "PTS", value: p.points || 0 },
      { name: "AST", value: p.assists || 0 },
      { name: "REB", value: p.rebounds || 0 },
    ],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `Game Score: ${gs.toFixed(1)} (${p.points || 0}pts, ${p.assists || 0}ast, ${p.rebounds || 0}reb)`,
  };
}

function computeUsage(p: any, teamTotals: any) {
  if (!p.minutes || !teamTotals.fg_attempted) return null;
  const num = ((p.fg_attempted || 0) + 0.44 * (p.ft_attempted || 0) + (p.turnovers || 0)) * ((teamTotals.minutes || 240) / 5);
  const den = (p.minutes || 1) * ((teamTotals.fg_attempted || 1) + 0.44 * (teamTotals.ft_attempted || 0) + (teamTotals.turnovers || 0));
  const usg = 100 * (num / (den || 1));
  const score = Math.max(-1, Math.min(1, (usg - 20) / 15));

  return {
    model_id: "usage",
    scope: "player",
    metrics: [
      { name: "USG%", value: +usg.toFixed(1), unit: "%" },
      { name: "Minutes", value: p.minutes || 0, unit: "min" },
    ],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `USG% ${usg.toFixed(1)}% in ${p.minutes || 0} min`,
  };
}

function computePlusMinus(p: any) {
  const pm = p.plus_minus ?? 0;
  const score = Math.max(-1, Math.min(1, pm / 20));
  return {
    model_id: "plus_minus",
    scope: "player",
    metrics: [{ name: "+/-", value: pm }],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `+/- ${pm > 0 ? "+" : ""}${pm}`,
  };
}

/* ── Matchup Models ── */

function computeLog5(homeWinPct: number, awayWinPct: number) {
  // Log5 formula: P(A beats B) = (pA - pA*pB) / (pA + pB - 2*pA*pB)
  const pA = Math.max(0.01, Math.min(0.99, homeWinPct));
  const pB = Math.max(0.01, Math.min(0.99, awayWinPct));
  const prob = (pA - pA * pB) / (pA + pB - 2 * pA * pB);
  const score = Math.max(-1, Math.min(1, (prob - 0.5) * 4));

  return {
    model_id: "log5",
    scope: "hybrid",
    metrics: [
      { name: "Home Win Prob", value: +(prob * 100).toFixed(1), unit: "%" },
      { name: "Home Win%", value: +(homeWinPct * 100).toFixed(1), unit: "%" },
      { name: "Away Win%", value: +(awayWinPct * 100).toFixed(1), unit: "%" },
    ],
    signal: {
      direction: score > 0.15 ? "supports" : score < -0.15 ? "conflicts" : "neutral",
      strength: Math.abs(score) > 0.5 ? "strong" : Math.abs(score) > 0.2 ? "medium" : "weak",
      score: +score.toFixed(3),
    },
    summary: `Log5 Home Win Prob: ${(prob * 100).toFixed(1)}%`,
  };
}

function computePythag(wins: number, losses: number, ptsFor: number, ptsAgainst: number) {
  const exp = 13.91; // NBA exponent
  const pf = ptsFor || 1;
  const pa = ptsAgainst || 1;
  const pyth = Math.pow(pf, exp) / (Math.pow(pf, exp) + Math.pow(pa, exp));
  const actualWinPct = wins / ((wins + losses) || 1);
  const luck = actualWinPct - pyth;

  return {
    model_id: "pythag_expectation",
    scope: "team",
    metrics: [
      { name: "Pythag Win%", value: +(pyth * 100).toFixed(1), unit: "%" },
      { name: "Actual Win%", value: +(actualWinPct * 100).toFixed(1), unit: "%" },
      { name: "Luck Factor", value: +(luck * 100).toFixed(1), unit: "%" },
    ],
    signal: {
      direction: luck > 0.03 ? "conflicts" : luck < -0.03 ? "supports" : "neutral",
      strength: Math.abs(luck) > 0.05 ? "strong" : Math.abs(luck) > 0.02 ? "medium" : "weak",
      score: +Math.max(-1, Math.min(1, -luck * 10)).toFixed(3),
    },
    summary: `Pythag ${(pyth * 100).toFixed(1)}% vs Actual ${(actualWinPct * 100).toFixed(1)}% (Luck: ${luck > 0 ? "+" : ""}${(luck * 100).toFixed(1)}%)`,
  };
}

/* ── Market Models ── */

function computeMarketEdge(impliedProb: number, modelProb: number) {
  const edge = modelProb - impliedProb;
  const score = Math.max(-1, Math.min(1, edge * 5));

  return {
    edge,
    edgeAssessment: Math.abs(edge) > 0.08 ? "clear_edge" : Math.abs(edge) > 0.03 ? "thin_edge" : "no_edge",
    score,
  };
}

function oddsToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/* ── Aggregation ── */

function aggregateQuant(models: any[], marketSnapshot: any) {
  if (!models.length) return { quant_score: 0, edge_assessment: "no_edge", notes: "Insufficient data" };

  const totalScore = models.reduce((sum, m) => sum + (m.signal?.score || 0), 0);
  const avgScore = totalScore / models.length;
  const clamped = Math.max(-1, Math.min(1, avgScore));

  // Use market edge if available
  const supportCount = models.filter(m => m.signal?.direction === "supports").length;
  const conflictCount = models.filter(m => m.signal?.direction === "conflicts").length;

  let edgeAssessment = "no_edge";
  if (Math.abs(clamped) > 0.35) edgeAssessment = "clear_edge";
  else if (Math.abs(clamped) > 0.15) edgeAssessment = "thin_edge";

  return {
    quant_score: +clamped.toFixed(3),
    edge_assessment: edgeAssessment,
    notes: `${supportCount} models support, ${conflictCount} conflict. Avg signal: ${clamped > 0 ? "+" : ""}${clamped.toFixed(2)}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { game_id, player_id, force_refresh } = await req.json();
    if (!game_id) throw new Error("game_id is required");

    // Check cache first
    if (!force_refresh) {
      const { data: cached } = await sb
        .from("quant_cache")
        .select("*")
        .eq("game_id", game_id)
        .eq("entity_type", player_id ? "player" : "game")
        .eq("entity_id", player_id || "_game")
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          success: true,
          cached: true,
          quant: {
            market_snapshot: cached.market_snapshot,
            models: cached.models,
            verdict: cached.verdict,
          },
          signals: cached.signals,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch game
    const { data: game } = await sb.from("games").select("*").eq("id", game_id).single();
    if (!game) throw new Error("Game not found");

    const models: any[] = [];
    let marketSnapshot: any = { market_type: "moneyline" };

    // Fetch odds
    const { data: odds } = await sb
      .from("odds_snapshots")
      .select("*")
      .eq("game_id", game_id)
      .order("captured_at", { ascending: false })
      .limit(10);

    const ml = odds?.find(o => o.market_type === "moneyline");
    const spread = odds?.find(o => o.market_type === "spread");
    const total = odds?.find(o => o.market_type === "total");

    if (ml) {
      const homeOdds = ml.home_price || -110;
      const impliedProb = oddsToImpliedProb(homeOdds);
      marketSnapshot = {
        market_type: "moneyline",
        line: ml.line,
        odds_american: homeOdds,
        implied_prob: +impliedProb.toFixed(3),
      };
    }

    // Fetch team game stats (recent 5 games for each team)
    const fetchRecentTeamStats = async (abbr: string) => {
      const { data } = await sb
        .from("team_game_stats")
        .select("*")
        .eq("team_abbr", abbr)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    };

    const [homeStats, awayStats] = await Promise.all([
      fetchRecentTeamStats(game.home_abbr),
      fetchRecentTeamStats(game.away_abbr),
    ]);

    // Average recent stats
    const avgStats = (stats: any[]) => {
      if (!stats.length) return null;
      const keys = ["fg_made", "fg_attempted", "three_made", "three_attempted", "ft_made", "ft_attempted",
        "off_rebounds", "rebounds", "assists", "steals", "blocks", "turnovers", "fouls", "points"];
      const avg: any = { minutes: 240 };
      keys.forEach(k => { avg[k] = stats.reduce((s, r) => s + (r[k] || 0), 0) / stats.length; });
      avg.def_rebounds = avg.rebounds - avg.off_rebounds;
      return avg;
    };

    const homeAvg = avgStats(homeStats);
    const awayAvg = avgStats(awayStats);

    // Team models
    if (homeAvg && awayAvg) {
      models.push(computeFourFactors(homeAvg, awayAvg));
      models.push(computeEfficiency(homeAvg, awayAvg));
      models.push(computePace(homeAvg, awayAvg));
    }

    // Season stats for net rating
    const { data: homeSeasonStats } = await sb
      .from("team_season_stats")
      .select("*")
      .eq("team_abbr", game.home_abbr)
      .order("season", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (homeSeasonStats) {
      const nr = computeNetRating(homeSeasonStats);
      if (nr) models.push(nr);
    }

    // Standings for matchup models
    const { data: standings } = await sb
      .from("standings")
      .select("*")
      .in("team_abbr", [game.home_abbr, game.away_abbr])
      .order("season", { ascending: false })
      .limit(2);

    const homeStanding = standings?.find(s => s.team_abbr === game.home_abbr);
    const awayStanding = standings?.find(s => s.team_abbr === game.away_abbr);

    if (homeStanding && awayStanding) {
      const homeWinPct = homeStanding.win_pct ?? (homeStanding.wins / ((homeStanding.wins + homeStanding.losses) || 1));
      const awayWinPct = awayStanding.win_pct ?? (awayStanding.wins / ((awayStanding.wins + awayStanding.losses) || 1));
      models.push(computeLog5(homeWinPct, awayWinPct));

      if (homeStanding.points_for && homeStanding.points_against) {
        models.push(computePythag(
          homeStanding.wins, homeStanding.losses,
          homeStanding.points_for, homeStanding.points_against
        ));
      }
    }

    // Player models if requested
    if (player_id) {
      const { data: playerStats } = await sb
        .from("player_game_stats")
        .select("*")
        .eq("player_id", player_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (playerStats?.length) {
        // Use most recent game for game score
        models.push(computeGameScore(playerStats[0]));
        models.push(computePlusMinus(playerStats[0]));

        // Compute usage using team totals
        const teamAbbr = playerStats[0].team_abbr;
        const teamStats = teamAbbr === game.home_abbr ? homeAvg : awayAvg;
        if (teamStats) {
          const usg = computeUsage(playerStats[0], teamStats);
          if (usg) models.push(usg);
        }
      }
    }

    // Aggregate verdict
    const verdict = aggregateQuant(models, marketSnapshot);

    // Build signals
    const quantLean = verdict.quant_score > 0.15 ? "support" : verdict.quant_score < -0.15 ? "fade" : "neutral";
    const signals = {
      quant: { lean: quantLean, edge: verdict.edge_assessment },
    };

    // Cache the result
    await sb.from("quant_cache").upsert({
      game_id,
      entity_type: player_id ? "player" : "game",
      entity_id: player_id || "_game",
      models,
      verdict,
      market_snapshot: marketSnapshot,
      signals,
      computed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "game_id,entity_type,entity_id" });

    return new Response(JSON.stringify({
      success: true,
      cached: false,
      quant: { market_snapshot: marketSnapshot, models, verdict },
      signals,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("quant-engine error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
