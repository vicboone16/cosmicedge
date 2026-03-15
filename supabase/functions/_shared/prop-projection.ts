/**
 * Prop Projection Engine — shared library for live prop intelligence.
 * Computes projections, hit probability, pace, status labels.
 */

// ── Normal CDF (Abramowitz & Stegun approximation) ──
export function normalCdf(z: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429, p = 0.2316419;
  const c = 0.3989422804014327;
  const x = Math.abs(z);
  const t = 1.0 / (1.0 + p * x);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const approx = 1.0 - c * Math.exp(-0.5 * x * x) * poly;
  return z < 0 ? 1.0 - approx : approx;
}

// ── Period helpers ──
const PERIOD_TOTAL_MINUTES: Record<string, number> = {
  full: 48, q1: 12, q2: 12, q3: 12, q4: 12, "1h": 24, "2h": 24,
};

export function getPeriodTotalMinutes(scope: string): number {
  return PERIOD_TOTAL_MINUTES[scope] || 48;
}

/** Estimate elapsed minutes for a period scope given game quarter + clock */
export function getElapsedMinutes(
  scope: string, quarter: number, clockSec: number | null
): number {
  const qLen = 12; // NBA
  const clockMin = clockSec != null ? clockSec / 60 : 0;
  const qElapsed = qLen - clockMin;

  switch (scope) {
    case "full":
      return (quarter - 1) * qLen + qElapsed;
    case "q1": return quarter === 1 ? qElapsed : qLen;
    case "q2": return quarter <= 1 ? 0 : quarter === 2 ? qElapsed : qLen;
    case "q3": return quarter <= 2 ? 0 : quarter === 3 ? qElapsed : qLen;
    case "q4": return quarter <= 3 ? 0 : quarter === 4 ? qElapsed : qLen;
    case "1h":
      if (quarter <= 1) return qElapsed;
      if (quarter === 2) return qLen + qElapsed;
      return 24;
    case "2h":
      if (quarter <= 2) return 0;
      if (quarter === 3) return qElapsed;
      if (quarter === 4) return qLen + qElapsed;
      return 24;
    default:
      return (quarter - 1) * qLen + qElapsed;
  }
}

/** Check if period is still active */
export function isPeriodActive(scope: string, quarter: number): boolean {
  switch (scope) {
    case "full": return quarter <= 4;
    case "q1": return quarter <= 1;
    case "q2": return quarter <= 2;
    case "q3": return quarter <= 3;
    case "q4": return quarter <= 4;
    case "1h": return quarter <= 2;
    case "2h": return quarter >= 3 && quarter <= 4;
    default: return true;
  }
}

// ── Default stat standard deviations (from historical NBA data) ──
const STAT_STDDEV: Record<string, number> = {
  points: 7.5, rebounds: 3.2, assists: 2.8, steals: 1.1,
  blocks: 0.9, turnovers: 1.3, three_made: 1.5,
  pra: 9.0, pts_reb: 8.5, pts_ast: 8.0, reb_ast: 4.5,
};

export function getStatStdDev(propType: string): number {
  const key = propType.replace(/^(q[1-4]|[12]h):/, "").toLowerCase();
  return STAT_STDDEV[key] || 5.0;
}

export interface PropContext {
  currentValue: number;
  line: number;
  periodScope: string;
  quarter: number;
  clockSec: number | null;
  minutesPlayed: number;
  historicalAvgMinutes: number; // player's season avg minutes
  historicalStdDev: number | null; // historical stat std dev
  foulCount: number;
  homeScore: number;
  awayScore: number;
  isStarter: boolean;
  odds: number | null; // American odds for this prop
  // Phase 6: Astro timing overlay
  astroModifier?: number | null; // ±0.05 range
  astroNote?: string | null;
}

export interface PropProjection {
  projectedFinal: number;
  projectedMinutes: number;
  statRate: number;
  pacePct: number;
  hitProbability: number;
  impliedProbability: number | null;
  liveEdge: number | null;
  expectedReturn: number | null;
  liveConfidence: number;
  volatility: number;
  minutesSecurityScore: number;
  blowoutProbability: number;
  foulRiskLevel: string;
  statusLabel: string;
}

export function computeProjection(ctx: PropContext): PropProjection {
  const periodTotal = getPeriodTotalMinutes(ctx.periodScope);
  const elapsed = getElapsedMinutes(ctx.periodScope, ctx.quarter, ctx.clockSec);
  const remaining = Math.max(periodTotal - elapsed, 0);
  const active = isPeriodActive(ctx.periodScope, ctx.quarter);

  // ── Stat rate ──
  const effectiveMinutes = Math.max(ctx.minutesPlayed, 0.5);
  const statRate = ctx.currentValue / effectiveMinutes;

  // ── Projected remaining minutes ──
  let projMinRemaining: number;
  if (!active || remaining <= 0) {
    projMinRemaining = 0;
  } else {
    // Scale by ratio of historical average to period length
    const avgGameMin = Math.min(ctx.historicalAvgMinutes || 28, 48);
    const minuteRatio = avgGameMin / 48;
    projMinRemaining = remaining * minuteRatio;
  }

  // ── Foul risk adjustment ──
  let foulRiskLevel = "low";
  let foulPenalty = 1.0;
  if (ctx.foulCount >= 5) { foulRiskLevel = "extreme"; foulPenalty = 0.5; }
  else if (ctx.foulCount >= 4 && ctx.quarter <= 3) { foulRiskLevel = "severe"; foulPenalty = 0.7; }
  else if (ctx.foulCount >= 3 && ctx.quarter <= 2) { foulRiskLevel = "high"; foulPenalty = 0.8; }
  else if (ctx.foulCount >= 2 && ctx.quarter <= 1) { foulRiskLevel = "caution"; foulPenalty = 0.9; }

  projMinRemaining *= foulPenalty;

  // ── Blowout risk ──
  const scoreDiff = Math.abs(ctx.homeScore - ctx.awayScore);
  let blowoutProb = 0;
  if (ctx.quarter >= 3 && scoreDiff >= 25) blowoutProb = 0.85;
  else if (ctx.quarter >= 3 && scoreDiff >= 20) blowoutProb = 0.65;
  else if (ctx.quarter >= 3 && scoreDiff >= 15) blowoutProb = 0.35;
  else if (ctx.quarter >= 2 && scoreDiff >= 20) blowoutProb = 0.25;

  if (blowoutProb > 0.3 && ctx.isStarter) {
    projMinRemaining *= (1 - blowoutProb * 0.4); // starters get pulled in blowouts
  }

  // ── Astro timing overlay (Phase 6) — capped ±5% ──
  const astroMod = Math.max(-0.05, Math.min(0.05, ctx.astroModifier ?? 0));

  // ── Final projection ──
  const projectedMinutes = ctx.minutesPlayed + projMinRemaining;
  const rawProjected = ctx.currentValue + statRate * projMinRemaining;
  const projectedFinal = rawProjected * (1 + astroMod);

  // ── Pace % ──
  const expectedAtThisPoint = (elapsed / periodTotal) * ctx.line;
  const pacePct = expectedAtThisPoint > 0
    ? (ctx.currentValue / expectedAtThisPoint) * 100
    : (ctx.currentValue > 0 ? 150 : 0);

  // ── Hit probability (normal CDF) ──
  const stdDev = ctx.historicalStdDev || getStatStdDev(ctx.periodScope === "full" ? "points" : ctx.periodScope);
  // Scale stddev by remaining time fraction for live games
  const timeRatio = remaining / periodTotal;
  const liveStdDev = stdDev * Math.sqrt(Math.max(timeRatio, 0.05));
  const z = (projectedFinal - ctx.line) / Math.max(liveStdDev, 0.5);
  const hitProbability = Math.max(0.01, Math.min(0.99, normalCdf(z)));

  // ── Implied probability from odds ──
  let impliedProbability: number | null = null;
  if (ctx.odds != null) {
    if (ctx.odds > 0) impliedProbability = 100 / (ctx.odds + 100);
    else impliedProbability = Math.abs(ctx.odds) / (Math.abs(ctx.odds) + 100);
  }

  // ── Edge ──
  const liveEdge = impliedProbability != null
    ? (hitProbability - impliedProbability) * 100
    : null;

  // ── Expected return (per unit staked) ──
  let expectedReturn: number | null = null;
  if (ctx.odds != null) {
    const profitIfWin = ctx.odds > 0 ? ctx.odds / 100 : 100 / Math.abs(ctx.odds);
    expectedReturn = hitProbability * profitIfWin - (1 - hitProbability) * 1;
  }

  // ── Minutes security ──
  const minutesSecurityScore = Math.min(100, Math.max(0,
    (ctx.isStarter ? 70 : 40) +
    (foulPenalty >= 0.9 ? 15 : foulPenalty >= 0.7 ? 5 : -10) +
    (blowoutProb < 0.3 ? 15 : blowoutProb < 0.6 ? 5 : -10)
  ));

  // ── Confidence ──
  const liveConfidence = Math.min(95, Math.max(10,
    hitProbability * 60 +
    minutesSecurityScore * 0.2 +
    (1 - blowoutProb) * 15
  ));

  // ── Volatility ──
  const volatility = Math.min(100, Math.max(5,
    liveStdDev / Math.max(ctx.line, 1) * 100 +
    blowoutProb * 20 +
    (foulPenalty < 0.8 ? 15 : 0)
  ));

  // ── Status label ──
  let statusLabel = "pregame";
  if (!active || remaining <= 0) {
    statusLabel = "final";
  } else if (elapsed > 0) {
    if (hitProbability >= 0.70) statusLabel = "likely_hit";
    else if (hitProbability >= 0.45) statusLabel = "coinflip";
    else statusLabel = "danger";
  }

  return {
    projectedFinal: Math.round(projectedFinal * 10) / 10,
    projectedMinutes: Math.round(projectedMinutes * 10) / 10,
    statRate: Math.round(statRate * 1000) / 1000,
    pacePct: Math.round(pacePct),
    hitProbability: Math.round(hitProbability * 1000) / 1000,
    impliedProbability,
    liveEdge: liveEdge != null ? Math.round(liveEdge * 10) / 10 : null,
    expectedReturn: expectedReturn != null ? Math.round(expectedReturn * 100) / 100 : null,
    liveConfidence: Math.round(liveConfidence),
    volatility: Math.round(volatility),
    minutesSecurityScore: Math.round(minutesSecurityScore),
    blowoutProbability: Math.round(blowoutProb * 100) / 100,
    foulRiskLevel,
    statusLabel,
  };
}
