/**
 * Deterministic Slip Optimizer Scoring Engine v2
 * Now uses live_prop_state intelligence when available.
 * Adds: correlation detection, EV grades, minute security, foul/blowout risk.
 */

export interface LegInput {
  id: string;
  player_name_raw: string;
  stat_type: string;
  line: number;
  direction: string;
  match_status: string;
  live_value?: number | null;
  progress?: number | null;
  result?: string | null;
  game_id?: string | null;
  player_id?: string | null;
  // Live intelligence fields (from live_prop_state)
  projection?: number | null;
  edge?: number | null;
  probability?: number | null;
  confidence?: number | null;
  volatility?: number | null;
  matchup_quality?: number | null;
  trend_strength?: number | null;
  model_source?: string | null;
  // Phase 2 fields
  hit_probability?: number | null;
  implied_probability?: number | null;
  live_edge?: number | null;
  expected_return?: number | null;
  minutes_security_score?: number | null;
  foul_risk_level?: string | null;
  blowout_probability?: number | null;
  projected_minutes?: number | null;
  pace_pct?: number | null;
  status_label?: string | null;
  astro_note?: string | null;
}

export interface LegScore {
  id: string;
  player_name_raw: string;
  stat_type: string;
  line: number;
  direction: string;
  score: number;
  grade: string;
  edge: number;
  probability: number;
  confidence: number;
  volatility: number;
  matchup_quality: number;
  isSynthetic: boolean;
  rationale: string;
  flags: string[];
  // Phase 2 additions
  hitProbability: number;
  impliedProbability: number | null;
  liveEdge: number | null;
  expectedReturn: number | null;
  minutesSecurity: number;
  foulRiskLevel: string;
  blowoutProbability: number;
  projectedMinutes: number | null;
  pacePct: number | null;
  statusLabel: string;
  astroNote: string | null;
  weaknessReason: string | null;
  game_id: string | null;
}

export interface CorrelationAnalysis {
  score: number; // 0-100
  riskLevel: string; // low | moderate | high | extreme
  notes: string[];
  clusters: CorrelationCluster[];
}

export interface CorrelationCluster {
  game_id: string;
  legs: string[]; // leg IDs
  type: string; // same_game_overs | same_player | pace_dependent
  risk: number;
}

export interface SlipScore {
  score: number;
  grade: string;
  confidenceLabel: string;
  avgEdge: number;
  avgConfidence: number;
  avgVolatility: number;
  riskLevel: string;
  legCount: number;
  strongestLegIdx: number;
  weakestLegIdx: number;
  legs: LegScore[];
  riskFlags: string[];
  summary: string;
  // Phase 2 additions
  evGrade: string;
  avgHitProbability: number;
  slipSurvivalProbability: number;
  expectedValue: number;
  expectedPayout: number | null;
  correlation: CorrelationAnalysis;
  varianceConcentration: number;
  weakestLegReason: string | null;
  swapPriorityLegId: string | null;
  optimizationNote: string | null;
}

const GRADE_MAP: [number, string][] = [
  [95, "S"], [90, "A+"], [85, "A"], [80, "A-"],
  [75, "B+"], [70, "B"], [65, "B-"],
  [60, "C+"], [55, "C"], [50, "C-"],
  [40, "D"], [0, "F"],
];

function toGrade(score: number): string {
  for (const [threshold, grade] of GRADE_MAP) {
    if (score >= threshold) return grade;
  }
  return "F";
}

function toConfidenceLabel(score: number): string {
  if (score >= 85) return "Elite";
  if (score >= 75) return "Strong";
  if (score >= 65) return "Playable";
  if (score >= 50) return "Marginal";
  return "Weak";
}

function toRiskLevel(avgVol: number, legCount: number): string {
  const risk = avgVol * Math.sqrt(legCount);
  if (risk >= 60) return "High";
  if (risk >= 35) return "Moderate";
  return "Low";
}

function toEvGrade(ev: number): string {
  if (ev >= 0.15) return "plus_ev";
  if (ev >= 0.03) return "playable";
  if (ev >= -0.03) return "neutral";
  return "minus_ev";
}

const SYNTHETIC_STATUSES = new Set(["synthetic_created", "unresolved"]);

function scoreLeg(leg: LegInput): LegScore {
  const isSynthetic = SYNTHETIC_STATUSES.has(leg.match_status);
  const hasLiveIntel = leg.hit_probability != null || leg.live_edge != null;

  // Use live_prop_state intelligence when available, otherwise derive
  const hitProb = leg.hit_probability ?? leg.probability ?? null;
  const edge = leg.live_edge ?? leg.edge ?? (leg.projection && leg.line
    ? ((leg.projection - leg.line) / leg.line) * 100
    : null);
  const probability = hitProb != null ? hitProb * 100 : (edge != null ? clamp(50 + edge * 2, 30, 90) : 55);
  const confidence = leg.confidence ?? (hasLiveIntel ? clamp(probability * 0.9, 30, 95) : 50);
  const volatility = leg.volatility ?? 30;
  const matchup = leg.matchup_quality ?? 60;
  const minutesSecurity = leg.minutes_security_score ?? 70;
  const foulRiskLevel = leg.foul_risk_level ?? "low";
  const blowoutProb = leg.blowout_probability ?? 0;

  // Weighted composite — now uses real data when available
  let score =
    (edge ?? 5) * 0.15 +
    probability * 0.25 +
    confidence * 0.15 +
    (100 - volatility) * 0.10 +
    matchup * 0.05 +
    minutesSecurity * 0.15 +
    (1 - blowoutProb) * 100 * 0.05 +
    (foulRiskLevel === "low" ? 10 : foulRiskLevel === "caution" ? 5 : 0) +
    (isSynthetic ? 0 : 5);

  score = clamp(score, 5, 99);

  // Weakness reason
  let weaknessReason: string | null = null;
  if (hitProb != null && hitProb < 0.45) weaknessReason = "Low hit probability";
  else if (minutesSecurity < 40) weaknessReason = "Minute security concern";
  else if (foulRiskLevel === "severe" || foulRiskLevel === "extreme") weaknessReason = "Foul trouble risk";
  else if (blowoutProb > 0.5) weaknessReason = "Blowout risk — reduced minutes";
  else if (volatility > 60) weaknessReason = "High stat volatility";
  else if (edge != null && edge < 0) weaknessReason = "Negative edge vs market";

  // Build rationale using real data
  const flags: string[] = [];
  let rationale = "";

  if (hasLiveIntel) {
    if (hitProb != null && hitProb >= 0.70) {
      rationale = "Live projection strongly favors clearing this line.";
    } else if (hitProb != null && hitProb >= 0.50) {
      rationale = "Projection shows reasonable path to clearing.";
    } else if (hitProb != null && hitProb < 0.45) {
      rationale = "Projection indicates this line may be difficult to clear.";
      flags.push("danger");
    } else {
      rationale = "Live data feeding projection engine.";
    }
  } else if (edge != null && edge >= 8 && volatility <= 30) {
    rationale = "Strong edge + low volatility = high-quality leg.";
  } else if (edge != null && edge >= 5) {
    rationale = "Good edge supported by projection.";
  } else if (edge != null && edge < 2) {
    rationale = "Thin edge — market is tight on this line.";
    flags.push("thin_edge");
  } else {
    rationale = "Limited live data — using baseline estimates.";
    flags.push("no_live_data");
  }

  if (isSynthetic) {
    rationale += " Synthetic prop — limited market data.";
    flags.push("synthetic");
  }
  if (volatility >= 50) flags.push("high_volatility");
  if (confidence < 45) flags.push("low_confidence");
  if (foulRiskLevel !== "low") flags.push("foul_risk");
  if (blowoutProb > 0.3) flags.push("blowout_risk");
  if (minutesSecurity < 50) flags.push("minute_volatile");

  return {
    id: leg.id,
    player_name_raw: leg.player_name_raw,
    stat_type: leg.stat_type,
    line: leg.line,
    direction: leg.direction,
    score: Math.round(score),
    grade: toGrade(score),
    edge: round2(edge ?? 0),
    probability: round2(probability),
    confidence: round2(confidence),
    volatility: round2(volatility),
    matchup_quality: round2(matchup),
    isSynthetic,
    rationale,
    flags,
    // Phase 2
    hitProbability: round2(hitProb ?? probability / 100),
    impliedProbability: leg.implied_probability ?? null,
    liveEdge: leg.live_edge ?? null,
    expectedReturn: leg.expected_return ?? null,
    minutesSecurity: round2(minutesSecurity),
    foulRiskLevel,
    blowoutProbability: round2(blowoutProb),
    projectedMinutes: leg.projected_minutes ?? null,
    pacePct: leg.pace_pct ?? null,
    statusLabel: leg.status_label ?? "pregame",
    astroNote: leg.astro_note ?? null,
    weaknessReason,
    game_id: leg.game_id ?? null,
  };
}

function detectCorrelation(legs: LegScore[]): CorrelationAnalysis {
  const notes: string[] = [];
  const clusters: CorrelationCluster[] = [];
  let totalScore = 0;

  // 1. Same-game exposure
  const byGame: Record<string, LegScore[]> = {};
  for (const l of legs) {
    if (l.game_id) {
      if (!byGame[l.game_id]) byGame[l.game_id] = [];
      byGame[l.game_id].push(l);
    }
  }

  for (const [gid, gameLegs] of Object.entries(byGame)) {
    if (gameLegs.length >= 2) {
      const overLegs = gameLegs.filter(l => l.direction === "over");
      const risk = Math.min(gameLegs.length * 15, 50);
      totalScore += risk;
      clusters.push({
        game_id: gid,
        legs: gameLegs.map(l => l.id),
        type: "same_game",
        risk,
      });

      if (overLegs.length >= 2) {
        notes.push(`${overLegs.length} pace-dependent overs in same game increase shared failure risk.`);
        totalScore += overLegs.length * 8;
      }

      if (gameLegs.length >= 3) {
        notes.push("Slip has stacked same-game exposure.");
        totalScore += 10;
      }
    }
  }

  // 2. Same-player stacking
  const byPlayer: Record<string, LegScore[]> = {};
  for (const l of legs) {
    const key = l.player_name_raw.toLowerCase();
    if (!byPlayer[key]) byPlayer[key] = [];
    byPlayer[key].push(l);
  }

  for (const [name, playerLegs] of Object.entries(byPlayer)) {
    if (playerLegs.length >= 2) {
      notes.push(`${playerLegs.length} legs rely on ${playerLegs[0].player_name_raw}'s usage profile.`);
      totalScore += playerLegs.length * 12;
      if (playerLegs[0].game_id) {
        clusters.push({
          game_id: playerLegs[0].game_id,
          legs: playerLegs.map(l => l.id),
          type: "same_player",
          risk: playerLegs.length * 12,
        });
      }
    }
  }

  // 3. All-overs correlation
  const allOvers = legs.filter(l => l.direction === "over");
  if (allOvers.length === legs.length && legs.length >= 3) {
    notes.push("All legs are overs — fully correlated to game pace/tempo.");
    totalScore += 15;
  }

  totalScore = clamp(totalScore, 0, 100);
  const riskLevel = totalScore >= 60 ? "extreme" : totalScore >= 40 ? "high" : totalScore >= 20 ? "moderate" : "low";

  if (notes.length === 0 && legs.length > 1) {
    notes.push("Legs are diversified across different games and players.");
  }

  return { score: totalScore, riskLevel, notes, clusters };
}

export function scoreSlip(
  slip: { entry_type?: string; stake?: number; payout?: number },
  picks: LegInput[]
): SlipScore {
  if (!picks.length) return emptySlip();

  const legs = picks.map(scoreLeg);
  const correlation = detectCorrelation(legs);

  const avgEdge = avg(legs.map(l => l.edge));
  const avgConf = avg(legs.map(l => l.confidence));
  const avgVol = avg(legs.map(l => l.volatility));
  const avgHitProb = avg(legs.map(l => l.hitProbability));

  // Slip survival probability (product of individual hit probabilities)
  const survivalProb = legs.reduce((acc, l) => acc * l.hitProbability, 1);

  // Expected value
  const stake = slip.stake ?? 1;
  const payout = slip.payout ?? stake * 2;
  const profitIfWin = payout - stake;
  const ev = survivalProb * profitIfWin - (1 - survivalProb) * stake;
  const evPerUnit = ev / Math.max(stake, 1);

  // Variance concentration
  const volStdDev = legs.length > 1
    ? Math.sqrt(legs.reduce((acc, l) => acc + Math.pow(l.volatility - avgVol, 2), 0) / legs.length)
    : 0;
  const varianceConcentration = clamp(volStdDev + correlation.score * 0.3, 0, 100);

  // Slip score: blend avg, min, and correlation penalty
  const minLeg = Math.min(...legs.map(l => l.score));
  const avgLeg = avg(legs.map(l => l.score));
  const correlationPenalty = correlation.score * 0.15;
  const slipScore = clamp(avgLeg * 0.5 + minLeg * 0.35 + (100 - correlationPenalty) * 0.15, 5, 99);

  let strongestIdx = 0;
  let weakestIdx = 0;
  legs.forEach((l, i) => {
    if (l.score > legs[strongestIdx].score) strongestIdx = i;
    if (l.score < legs[weakestIdx].score) weakestIdx = i;
  });

  // Weakest leg reason
  const weakestLeg = legs[weakestIdx];
  let weakestLegReason = weakestLeg.weaknessReason;
  if (!weakestLegReason) {
    weakestLegReason = `Lowest composite score (${weakestLeg.score}/100)`;
  }

  // Swap priority: weakest leg unless it's already settled
  const swapPriorityLegId = picks[weakestIdx]?.result ? null : weakestLeg.id;

  // Optimization note
  let optimizationNote: string | null = null;
  if (correlation.riskLevel === "high" || correlation.riskLevel === "extreme") {
    optimizationNote = "Slip overexposed to same-game pace risk. Consider diversifying.";
  } else if (evPerUnit < -0.1) {
    optimizationNote = "Negative EV slip — consider swapping weakest leg for higher-edge alternative.";
  } else if (weakestLeg.minutesSecurity < 40) {
    optimizationNote = "Weakest leg is minute-volatile — consider a safer rotation player.";
  } else if (weakestLeg.foulRiskLevel !== "low") {
    optimizationNote = `Weakest leg has ${weakestLeg.foulRiskLevel} foul risk — projected minutes may be cut.`;
  } else if (varianceConcentration > 40) {
    optimizationNote = "High variance concentration — one volatile leg is dragging slip stability.";
  }

  const riskFlags: string[] = [];
  if (legs.some(l => l.flags.includes("synthetic"))) riskFlags.push("Contains synthetic/imported props");
  if (avgVol >= 40) riskFlags.push("High average volatility");
  if (legs.some(l => l.flags.includes("thin_edge"))) riskFlags.push("Thin edge on one or more legs");
  if (picks.length >= 5) riskFlags.push("5+ leg parlay — correlation risk");
  if (correlation.riskLevel === "high" || correlation.riskLevel === "extreme") {
    riskFlags.push(`${correlation.riskLevel.charAt(0).toUpperCase() + correlation.riskLevel.slice(1)} correlation risk`);
  }
  if (legs.some(l => l.flags.includes("foul_risk"))) riskFlags.push("Foul trouble detected on one or more legs");
  if (legs.some(l => l.flags.includes("blowout_risk"))) riskFlags.push("Blowout risk may reduce starter minutes");

  const riskLevel = toRiskLevel(avgVol, picks.length);
  const evGrade = toEvGrade(evPerUnit);

  const summary = `${picks.length}-leg ${slip.entry_type || "parlay"} graded ${toGrade(Math.round(slipScore))} (${Math.round(slipScore)}/100). ` +
    `Avg hit prob: ${(avgHitProb * 100).toFixed(0)}%, Survival: ${(survivalProb * 100).toFixed(1)}%. ` +
    `EV: ${evPerUnit >= 0 ? "+" : ""}${evPerUnit.toFixed(2)}u (${evGrade}). ` +
    `Correlation: ${correlation.riskLevel}. Risk: ${riskLevel}.`;

  return {
    score: Math.round(slipScore),
    grade: toGrade(Math.round(slipScore)),
    confidenceLabel: toConfidenceLabel(Math.round(slipScore)),
    avgEdge: round2(avgEdge),
    avgConfidence: round2(avgConf),
    avgVolatility: round2(avgVol),
    riskLevel,
    legCount: picks.length,
    strongestLegIdx: strongestIdx,
    weakestLegIdx: weakestIdx,
    legs,
    riskFlags,
    summary,
    // Phase 2
    evGrade,
    avgHitProbability: round2(avgHitProb),
    slipSurvivalProbability: round2(survivalProb),
    expectedValue: round2(evPerUnit),
    expectedPayout: slip.payout ?? null,
    correlation,
    varianceConcentration: round2(varianceConcentration),
    weakestLegReason,
    swapPriorityLegId,
    optimizationNote,
  };
}

// Helpers
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function round2(v: number) { return Math.round(v * 100) / 100; }
function avg(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function emptySlip(): SlipScore {
  return {
    score: 0, grade: "F", confidenceLabel: "Weak",
    avgEdge: 0, avgConfidence: 0, avgVolatility: 0,
    riskLevel: "Unknown", legCount: 0,
    strongestLegIdx: 0, weakestLegIdx: 0,
    legs: [], riskFlags: [], summary: "No legs to score.",
    evGrade: "neutral", avgHitProbability: 0,
    slipSurvivalProbability: 0, expectedValue: 0,
    expectedPayout: null, correlation: { score: 0, riskLevel: "low", notes: [], clusters: [] },
    varianceConcentration: 0, weakestLegReason: null,
    swapPriorityLegId: null, optimizationNote: null,
  };
}
