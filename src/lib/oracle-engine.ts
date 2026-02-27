/**
 * Oracle Engine — Pregame ML, Score Projections, Live WP, Quarter ML
 * 
 * Implements:
 * - Possession-based expected points (NBA/NFL)
 * - Poisson/Skellam for low-scoring sports (NHL/MLB)
 * - Logistic win probability (pregame + live)
 * - Quarter/period win probability
 * - Fair moneyline conversion
 * - Edge vs book calculation
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Sport = "NBA" | "NFL" | "NHL" | "MLB";

export interface TeamRatings {
  offRtg: number;
  defRtg: number;
  netRtg: number;
  pace: number;
  gamesPlayed: number;
}

export interface PregameInput {
  sport: Sport;
  homeRatings: TeamRatings;
  awayRatings: TeamRatings;
  homeAdvantage?: number; // default per sport
  bookMLHome?: number; // American odds from book
  bookMLAway?: number;
  bookSpread?: number;
  bookTotal?: number;
}

export interface PregameOutput {
  muHome: number;
  muAway: number;
  muTotal: number;
  muSpreadHome: number;
  pHomeWin: number;
  pAwayWin: number;
  fairMLHome: number;
  fairMLAway: number;
  expectedPossessions: number;
  blowoutRisk: number;
  // Edge vs book
  bookImpliedHome: number | null;
  edgeHome: number | null;
  edgeAway: number | null;
  // Confidence interval
  pHomeWinCILow: number;
  pHomeWinCIHigh: number;
}

/** Scope for live WP calculation — determines the time horizon */
export type WPScope = "game" | "half" | "quarter";

export interface LiveWPInput {
  sport: Sport;
  scoreDiff: number;       // home - away (for the relevant scope)
  timeRemaining: number;   // seconds remaining in the GAME (full clock)
  possession: number;      // +1 home, -1 away, 0 unknown
  isHome: boolean;         // perspective team is home
  paceEstimate?: number;   // possessions per 48 min
  quarter?: number;        // current quarter (1-4, 5+ OT)
  bonusState?: number;     // 0 normal, 1 bonus, 2 double bonus
  timeoutsHome?: number;
  timeoutsAway?: number;
}

export interface LiveWPOutput {
  wpGame: number;
  wpHalf: number;
  wpQuarter: number;
  fairMLGame: number;
  fairMLHalf: number;
  fairMLQuarter: number;
  possessionsRemaining: number;
}

export interface QuarterPrediction {
  quarter: number;
  wpHome: number;
  fairMLHome: number;
  fairMLAway: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORT_DEFAULTS: Record<Sport, {
  homeAdv: number;        // home advantage in scoring units
  avgPace: number;        // possessions/period-unit
  sigma: number;          // scoring margin std dev
  secPerPoss: number;     // seconds per possession
  gameLengthSec: number;  // total game seconds
  periodsPerGame: number;
}> = {
  NBA: { homeAdv: 3.0, avgPace: 100, sigma: 12.5, secPerPoss: 14.5, gameLengthSec: 2880, periodsPerGame: 4 },
  NFL: { homeAdv: 2.5, avgPace: 60, sigma: 13.5, secPerPoss: 40, gameLengthSec: 3600, periodsPerGame: 4 },
  NHL: { homeAdv: 0.15, avgPace: 30, sigma: 1.6, secPerPoss: 60, gameLengthSec: 3600, periodsPerGame: 3 },
  MLB: { homeAdv: 0.25, avgPace: 38, sigma: 2.8, secPerPoss: 70, gameLengthSec: 10800, periodsPerGame: 9 },
};

// ─── Math Helpers ─────────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz & Stegun approximation) */
function normCDF(z: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const x = Math.abs(z);
  const t = 1.0 / (1.0 + 0.2316419 * x);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const approx = 1.0 - 0.3989422804014327 * Math.exp(-0.5 * x * x) * poly;
  return z < 0 ? 1.0 - approx : approx;
}

/** Logistic sigmoid */
function sigmoid(z: number): number {
  return 1.0 / (1.0 + Math.exp(-z));
}

/** Clamp value between min and max */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Convert win probability to American odds (fair, no vig) */
export function wpToAmericanOdds(wp: number): number {
  wp = clamp(wp, 0.01, 0.99);
  if (wp >= 0.5) {
    return Math.round(-100 * wp / (1 - wp));
  }
  return Math.round(100 * (1 - wp) / wp);
}

/** Convert American odds to implied probability */
export function americanToImplied(odds: number): number {
  if (!odds || odds === 0) return 0;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

// ─── Pregame Prediction Engine ────────────────────────────────────────────────

export function computePregame(input: PregameInput): PregameOutput {
  const { sport, homeRatings, awayRatings, bookMLHome, bookMLAway } = input;
  const defs = SPORT_DEFAULTS[sport];
  const homeAdv = input.homeAdvantage ?? defs.homeAdv;

  // Expected pace for this matchup
  const matchupPace = (homeRatings.pace + awayRatings.pace) / 2;
  const expectedPossessions = matchupPace;

  if (sport === "NHL" || sport === "MLB") {
    return computePoissonPregame(input, defs, matchupPace, homeAdv);
  }

  // ── Possession-based expected points (NBA/NFL) ──────────────────────────
  // OE_home = f(home_off, away_def) adjusted to league-average 100
  // Score = possessions * efficiency / 100
  const leagueAvgRtg = 110; // approximate NBA league avg ORtg
  
  // Opponent-adjusted efficiency
  const homeOE = homeRatings.offRtg + (awayRatings.defRtg - leagueAvgRtg); // higher opponent defRtg = easier
  const awayOE = awayRatings.offRtg + (homeRatings.defRtg - leagueAvgRtg);

  const muHome = (matchupPace * homeOE / 100) + (homeAdv / 2);
  const muAway = (matchupPace * awayOE / 100) - (homeAdv / 2);
  const muTotal = muHome + muAway;
  const muSpreadHome = muHome - muAway;

  // Sigma scales down with more data
  const dataFactor = Math.min(1, Math.max(0.7, 1 - (Math.min(homeRatings.gamesPlayed, awayRatings.gamesPlayed) - 5) * 0.01));
  const sigma = defs.sigma * dataFactor;

  // Win probability via normal CDF
  const pHomeWin = normCDF(muSpreadHome / sigma);
  const pAwayWin = 1 - pHomeWin;

  // Blowout risk
  const blowoutRisk = clamp(Math.abs(homeRatings.netRtg - awayRatings.netRtg) / 30, 0, 1);

  // Fair ML
  const fairMLHome = wpToAmericanOdds(pHomeWin);
  const fairMLAway = wpToAmericanOdds(pAwayWin);

  // Edge vs book
  const bookImpliedHome = bookMLHome ? americanToImplied(bookMLHome) : null;
  const edgeHome = bookImpliedHome != null ? +(pHomeWin - bookImpliedHome).toFixed(4) : null;
  const edgeAway = bookMLAway ? +(pAwayWin - americanToImplied(bookMLAway)).toFixed(4) : null;

  // CI (~90% interval)
  const ciWidth = 1.645 * sigma / (sigma + 5); // rough scaling
  const pHomeWinCILow = clamp(pHomeWin - ciWidth * 0.15, 0.01, 0.99);
  const pHomeWinCIHigh = clamp(pHomeWin + ciWidth * 0.15, 0.01, 0.99);

  return {
    muHome: +muHome.toFixed(1),
    muAway: +muAway.toFixed(1),
    muTotal: +muTotal.toFixed(1),
    muSpreadHome: +muSpreadHome.toFixed(1),
    pHomeWin: +pHomeWin.toFixed(4),
    pAwayWin: +pAwayWin.toFixed(4),
    fairMLHome,
    fairMLAway,
    expectedPossessions: +matchupPace.toFixed(1),
    blowoutRisk: +blowoutRisk.toFixed(4),
    bookImpliedHome,
    edgeHome,
    edgeAway,
    pHomeWinCILow: +pHomeWinCILow.toFixed(4),
    pHomeWinCIHigh: +pHomeWinCIHigh.toFixed(4),
  };
}

/** Poisson-based for NHL/MLB */
function computePoissonPregame(
  input: PregameInput,
  defs: typeof SPORT_DEFAULTS.NHL,
  matchupPace: number,
  homeAdv: number
): PregameOutput {
  const { homeRatings, awayRatings, bookMLHome, bookMLAway } = input;

  // Expected goals/runs
  const leagueAvg = input.sport === "NHL" ? 3.1 : 4.5; // goals or runs per team per game
  const homeStrength = homeRatings.offRtg > 0 ? homeRatings.offRtg / 100 : 1;
  const awayStrength = awayRatings.offRtg > 0 ? awayRatings.offRtg / 100 : 1;
  const homeDefFactor = awayRatings.defRtg > 0 ? awayRatings.defRtg / 100 : 1;
  const awayDefFactor = homeRatings.defRtg > 0 ? homeRatings.defRtg / 100 : 1;

  const muHome = leagueAvg * homeStrength * (2 - homeDefFactor) + homeAdv;
  const muAway = leagueAvg * awayStrength * (2 - awayDefFactor);

  // Skellam approximation via normal
  const muDiff = muHome - muAway;
  const sigmaDiff = Math.sqrt(muHome + muAway); // Skellam std dev
  const pHomeWin = normCDF(muDiff / sigmaDiff);

  const muTotal = muHome + muAway;
  const muSpreadHome = muHome - muAway;
  const pAwayWin = 1 - pHomeWin;
  const blowoutRisk = clamp(Math.abs(muDiff) / (input.sport === "NHL" ? 3 : 5), 0, 1);

  const fairMLHome = wpToAmericanOdds(pHomeWin);
  const fairMLAway = wpToAmericanOdds(pAwayWin);
  const bookImpliedHome = bookMLHome ? americanToImplied(bookMLHome) : null;
  const edgeHome = bookImpliedHome != null ? +(pHomeWin - bookImpliedHome).toFixed(4) : null;
  const edgeAway = bookMLAway ? +(pAwayWin - americanToImplied(bookMLAway)).toFixed(4) : null;

  return {
    muHome: +muHome.toFixed(1),
    muAway: +muAway.toFixed(1),
    muTotal: +muTotal.toFixed(1),
    muSpreadHome: +muSpreadHome.toFixed(1),
    pHomeWin: +pHomeWin.toFixed(4),
    pAwayWin: +pAwayWin.toFixed(4),
    fairMLHome,
    fairMLAway,
    expectedPossessions: +matchupPace.toFixed(1),
    blowoutRisk: +blowoutRisk.toFixed(4),
    bookImpliedHome,
    edgeHome,
    edgeAway,
    pHomeWinCILow: +clamp(pHomeWin - 0.12, 0.01, 0.99).toFixed(4),
    pHomeWinCIHigh: +clamp(pHomeWin + 0.12, 0.01, 0.99).toFixed(4),
  };
}

// ─── Live Win Probability ─────────────────────────────────────────────────────

/**
 * Live WP — Logistic model: z = β0 + β1·sd + β2·ln(t+1) + β3·pos + β4·home
 * 
 * Key insight: score diff must be scaled by time remaining to produce
 * correct dynamics (small lead early ≈ 50%, small lead late ≈ 90%+).
 * We use sd / √(t/T + ε) as the effective score diff term within the
 * logistic framework, which is equivalent to having β1 interact with time.
 * 
 * For quarter WP: uses t = seconds_remaining_in_quarter, sd = quarter score diff.
 */
export function computeLiveWP(input: LiveWPInput): LiveWPOutput {
  const { sport, scoreDiff, timeRemaining, possession, isHome } = input;
  const defs = SPORT_DEFAULTS[sport];
  const betas = LIVE_BETAS[sport];

  const sd = isHome ? scoreDiff : -scoreDiff;
  const pos = isHome ? possession : -possession;
  const epsilon = 0.001;

  /**
   * Core WP calculation for a given scope.
   * @param scopeTimeSec  total duration of the scope (game/half/quarter) in seconds
   * @param timeLeftInScope  seconds remaining within that scope
   * @param scopeSd  score diff relevant to that scope
   * @param sigmaScale  sigma multiplier (shorter scopes have smaller variance)
   */
  function wpForScope(scopeTimeSec: number, timeLeftInScope: number, scopeSd: number, sigmaScale: number): number {
    const tFrac = Math.max(timeLeftInScope, 1) / scopeTimeSec;
    const scaledSd = scopeSd / (betas.sigma * sigmaScale * Math.sqrt(tFrac + epsilon));
    const dampen = Math.sqrt(tFrac);
    const z = betas.intercept + scaledSd + betas.possession * pos * dampen + betas.home * dampen;
    return clamp(sigmoid(z), 0.005, 0.995);
  }

  // ── Full Game WP ──
  const wpGame = wpForScope(defs.gameLengthSec, timeRemaining, sd, 1.0);

  // ── Half WP ──
  // Determine which half we're in and time remaining in that half
  const periodsPerHalf = Math.ceil(defs.periodsPerGame / 2); // NBA/NFL: 2, NHL: 1.5→2, MLB: 4.5→5
  const halfLengthSec = defs.gameLengthSec / 2;
  const currentQuarter = input.quarter ?? Math.max(1, Math.ceil((defs.gameLengthSec - timeRemaining) / (defs.gameLengthSec / defs.periodsPerGame)));
  const inFirstHalf = currentQuarter <= periodsPerHalf;
  // Time left in current half
  const timeLeftInHalf = inFirstHalf
    ? Math.min(timeRemaining - halfLengthSec, halfLengthSec)  // first half: game_remaining - second_half_length
    : Math.min(timeRemaining, halfLengthSec);                  // second half: capped to half length
  const halfTimeLeft = Math.max(timeLeftInHalf, 1);
  // Half score diff: use full score diff (approximation — caller can pass half-specific diff if available)
  const halfSd = sd;
  // Sigma for half: √2 smaller variance than full game (half the possessions)
  const wpHalf = wpForScope(halfLengthSec, halfTimeLeft, halfSd, 1 / Math.sqrt(2));

  // ── Quarter WP ──
  const periodLength = defs.gameLengthSec / defs.periodsPerGame;
  const timeInCurrentPeriod = Math.max(timeRemaining % periodLength || periodLength, 1);
  // Quarter score diff: approximate as proportional share
  const qtrSd = sd / defs.periodsPerGame;
  // Sigma for quarter: √periods smaller variance
  const wpQuarter = wpForScope(periodLength, timeInCurrentPeriod, qtrSd, 1 / Math.sqrt(defs.periodsPerGame));

  // Possessions remaining estimate
  const possRemaining = timeRemaining / defs.secPerPoss;

  return {
    wpGame: +wpGame.toFixed(4),
    wpHalf: +wpHalf.toFixed(4),
    wpQuarter: +wpQuarter.toFixed(4),
    fairMLGame: wpToAmericanOdds(wpGame),
    fairMLHalf: wpToAmericanOdds(wpHalf),
    fairMLQuarter: wpToAmericanOdds(wpQuarter),
    possessionsRemaining: +possRemaining.toFixed(1),
  };
}

/** Per-sport parameters for live WP logistic model */
const LIVE_BETAS: Record<Sport, {
  intercept: number;
  sigma: number;       // scoring margin std dev (normalizer)
  possession: number;  // possession value in z-score units
  home: number;        // home advantage in z-score units
}> = {
  // NBA: ~12.5 pt std dev per game, possession ≈ 0.5 pts
  NBA: { intercept: 0.0, sigma: 12.5, possession: 0.08, home: 0.12 },
  // NFL: ~13.5 pt std dev, possession ≈ 1 pt
  NFL: { intercept: 0.0, sigma: 13.5, possession: 0.15, home: 0.15 },
  // NHL: ~1.6 goal std dev
  NHL: { intercept: 0.0, sigma: 1.6, possession: 0.05, home: 0.10 },
  // MLB: ~2.8 run std dev
  MLB: { intercept: 0.0, sigma: 2.8, possession: 0.03, home: 0.08 },
};

// ─── Quarter Predictions ──────────────────────────────────────────────────────

/**
 * Generate per-quarter win probability and fair ML for all periods.
 * Uses pregame ratings to estimate per-period scoring expectations.
 */
export function computeQuarterPredictions(
  pregame: PregameOutput,
  sport: Sport,
  numPeriods?: number
): QuarterPrediction[] {
  const defs = SPORT_DEFAULTS[sport];
  const periods = numPeriods ?? defs.periodsPerGame;
  const predictions: QuarterPrediction[] = [];

  for (let q = 1; q <= periods; q++) {
    // Quarter scoring is roughly pregame / periods, with slight Q1 boost
    const qFactor = q === 1 ? 1.05 : q === 4 ? 0.95 : 1.0; // Q1 slightly higher pace
    const muDiffQ = (pregame.muSpreadHome / periods) * qFactor;
    const sigmaQ = (sport === "NHL" || sport === "MLB")
      ? Math.sqrt(pregame.muTotal / periods)
      : defs.sigma / Math.sqrt(periods) * 0.8;
    
    const wpHome = normCDF(muDiffQ / Math.max(sigmaQ, 0.5));

    predictions.push({
      quarter: q,
      wpHome: +wpHome.toFixed(4),
      fairMLHome: wpToAmericanOdds(wpHome),
      fairMLAway: wpToAmericanOdds(1 - wpHome),
    });
  }

  return predictions;
}

// ─── Edge Tier Classification ─────────────────────────────────────────────────

export type EdgeTier = "S" | "A" | "B" | "C" | "NO_BET";

export function classifyEdge(edge: number, blowoutRisk: number): { tier: EdgeTier; label: string; color: string } {
  if (edge < 0.01 || blowoutRisk > 0.65) return { tier: "NO_BET", label: "No Bet", color: "text-muted-foreground" };
  if (edge >= 0.06 && blowoutRisk < 0.3) return { tier: "S", label: "Celestial Lock", color: "text-cosmic-gold" };
  if (edge >= 0.04) return { tier: "A", label: "Star Signal", color: "text-cosmic-green" };
  if (edge >= 0.02) return { tier: "B", label: "Playable", color: "text-primary" };
  return { tier: "C", label: "Lean", color: "text-muted-foreground" };
}

// ─── Expected Points Remaining (Option B from spec) ───────────────────────────

export function expectedPointsRemaining(
  sport: Sport,
  timeRemaining: number,
  homePPP: number,
  awayPPP: number,
  currentScoreDiff: number,
  possession: number
): { expectedMargin: number; wpHome: number } {
  const defs = SPORT_DEFAULTS[sport];
  const possLeft = timeRemaining / defs.secPerPoss;
  const possessionBump = possession * (sport === "NBA" ? 0.5 : 0.3);
  const expectedDelta = currentScoreDiff + possLeft * (homePPP - awayPPP) + possessionBump;

  // Sigma shrinks as time runs out (less randomness)
  const sigmaT = defs.sigma * Math.sqrt(timeRemaining / defs.gameLengthSec);

  const wpHome = normCDF(expectedDelta / Math.max(sigmaT, 0.5));

  return {
    expectedMargin: +expectedDelta.toFixed(1),
    wpHome: +wpHome.toFixed(4),
  };
}
