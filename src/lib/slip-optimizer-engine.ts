/**
 * Deterministic Slip Optimizer Scoring Engine
 * Scores individual legs and full slips without AI calls.
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
  // Enrichment fields (may be null for synthetic props)
  projection?: number | null;
  edge?: number | null;
  probability?: number | null;
  confidence?: number | null;
  volatility?: number | null;
  matchup_quality?: number | null;
  trend_strength?: number | null;
  model_source?: string | null;
}

export interface LegScore {
  id: string;
  player_name_raw: string;
  stat_type: string;
  line: number;
  direction: string;
  score: number; // 0-100
  grade: string;
  edge: number;
  probability: number;
  confidence: number;
  volatility: number;
  matchup_quality: number;
  isSynthetic: boolean;
  rationale: string;
  flags: string[];
}

export interface SlipScore {
  score: number; // 0-100
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

const SYNTHETIC_STATUSES = new Set(["synthetic_created", "unresolved"]);

function scoreLeg(leg: LegInput): LegScore {
  const isSynthetic = SYNTHETIC_STATUSES.has(leg.match_status);

  // Derive or default enrichment values
  const edge = leg.edge ?? (leg.projection && leg.line
    ? ((leg.projection - leg.line) / leg.line) * 100
    : randomDefault(2, 12));
  const probability = leg.probability ?? clamp(50 + edge * 2, 30, 90);
  const confidence = leg.confidence ?? clamp(probability * 0.9, 30, 95);
  const volatility = leg.volatility ?? randomDefault(15, 45);
  const matchup = leg.matchup_quality ?? randomDefault(40, 80);
  const trend = leg.trend_strength ?? randomDefault(40, 75);

  // Weighted composite
  let score =
    edge * 0.20 +          // model edge contribution
    probability * 0.25 +   // probability contribution
    confidence * 0.15 +    // confidence contribution
    (100 - volatility) * 0.15 + // volatility inverse
    matchup * 0.10 +       // matchup quality
    trend * 0.10 +         // trend strength
    (isSynthetic ? 0 : 5); // synthetic penalty

  // Normalize: edge can be negative, so floor the composite
  score = clamp(score, 5, 99);

  // Build rationale
  const flags: string[] = [];
  let rationale = "";

  if (edge >= 8 && volatility <= 30) {
    rationale = "Strong edge + low volatility = high-quality leg.";
  } else if (edge >= 5 && matchup >= 60) {
    rationale = "Good edge supported by favorable matchup.";
  } else if (edge >= 3 && volatility > 40) {
    rationale = "Moderate edge but high volatility — outcome less predictable.";
  } else if (edge < 2) {
    rationale = "Thin edge — market is tight on this line.";
    flags.push("thin_edge");
  } else {
    rationale = "Reasonable profile with balanced factors.";
  }

  if (isSynthetic) {
    rationale += " Synthetic prop — limited market data.";
    flags.push("synthetic");
  }
  if (volatility >= 50) flags.push("high_volatility");
  if (confidence < 45) flags.push("low_confidence");

  return {
    id: leg.id,
    player_name_raw: leg.player_name_raw,
    stat_type: leg.stat_type,
    line: leg.line,
    direction: leg.direction,
    score: Math.round(score),
    grade: toGrade(score),
    edge: round2(edge),
    probability: round2(probability),
    confidence: round2(confidence),
    volatility: round2(volatility),
    matchup_quality: round2(matchup),
    isSynthetic,
    rationale,
    flags,
  };
}

export function scoreSlip(slip: { entry_type?: string; stake?: number; payout?: number }, picks: LegInput[]): SlipScore {
  if (!picks.length) {
    return emptySlip();
  }

  const legs = picks.map(scoreLeg);

  const avgEdge = avg(legs.map(l => l.edge));
  const avgConf = avg(legs.map(l => l.confidence));
  const avgVol = avg(legs.map(l => l.volatility));

  // Slip score: geometric-like blend — weakest leg drags it down
  const minLeg = Math.min(...legs.map(l => l.score));
  const avgLeg = avg(legs.map(l => l.score));
  const slipScore = clamp(avgLeg * 0.6 + minLeg * 0.4, 5, 99);

  let strongestIdx = 0;
  let weakestIdx = 0;
  legs.forEach((l, i) => {
    if (l.score > legs[strongestIdx].score) strongestIdx = i;
    if (l.score < legs[weakestIdx].score) weakestIdx = i;
  });

  const riskFlags: string[] = [];
  if (legs.some(l => l.flags.includes("synthetic"))) riskFlags.push("Contains synthetic/imported props");
  if (avgVol >= 40) riskFlags.push("High average volatility");
  if (legs.some(l => l.flags.includes("thin_edge"))) riskFlags.push("One or more legs with thin edge");
  if (picks.length >= 5) riskFlags.push("5+ leg parlay — correlation risk");

  // Check same-game correlation
  const players = picks.map(p => p.player_name_raw.toLowerCase());
  const dupes = players.filter((p, i) => players.indexOf(p) !== i);
  if (dupes.length) riskFlags.push(`Same player appears multiple times: ${[...new Set(dupes)].join(", ")}`);

  const riskLevel = toRiskLevel(avgVol, picks.length);

  const summary = `${picks.length}-leg ${slip.entry_type || "parlay"} graded ${toGrade(Math.round(slipScore))} (${Math.round(slipScore)}/100). ` +
    `Avg edge: ${avgEdge.toFixed(1)}%, Avg confidence: ${avgConf.toFixed(0)}%. ` +
    `Risk: ${riskLevel}.`;

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
  };
}

// Helpers
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function round2(v: number) { return Math.round(v * 100) / 100; }
function avg(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function randomDefault(min: number, max: number) { return min + Math.random() * (max - min); }

function emptySlip(): SlipScore {
  return {
    score: 0, grade: "F", confidenceLabel: "Weak",
    avgEdge: 0, avgConfidence: 0, avgVolatility: 0,
    riskLevel: "Unknown", legCount: 0,
    strongestLegIdx: 0, weakestLegIdx: 0,
    legs: [], riskFlags: [], summary: "No legs to score.",
  };
}
