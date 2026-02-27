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

export interface PeriodAverages {
  period: string; // Q1, Q2, Q3, Q4, 1H, 2H, OT
  avgPoints: number;
  avgPointsAllowed: number;
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
  label: string; // "Q1", "1H", etc.
  muHome: number;
  muAway: number;
  muTotal: number;
  muSpread: number;
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

  /**
   * Core WP using logistic model with ln(t+1) time interaction.
   * 
   * z = β1 · (sd / σ) · ln((T+1)/(t+1)) + β3 · pos · √(t/T) + β4 · √(t/T)
   * 
   * The ln((T+1)/(t+1)) term uses the user's ln(t+1) formulation:
   *   ln((T+1)/(t+1)) = ln(T+1) - ln(t+1)
   * 
   * When t is large (start of scope): ln ratio ≈ 0, so WP ≈ 50% regardless of score
   * When t is small (end of scope): ln ratio grows, score diff dominates
   * This ensures "the game gets decided faster near the end"
   */
  function wpForScope(T: number, t: number, scopeSd: number, sigma: number): number {
    const tClamped = Math.max(t, 1);
    const logRatio = Math.log(T + 1) - Math.log(tClamped + 1); // ln(T+1) - ln(t+1)
    const tFrac = Math.sqrt(tClamped / (T + 1)); // dampening for pos/home (1 at start, 0 at end)

    const scoreTerm = betas.beta1 * (scopeSd / sigma) * logRatio;
    const posTerm = betas.possession * pos * tFrac;
    const homeTerm = betas.home * tFrac;

    const z = scoreTerm + posTerm + homeTerm;
    return clamp(sigmoid(z), 0.005, 0.995);
  }

  // ── Full Game WP ──
  const wpGame = wpForScope(defs.gameLengthSec, timeRemaining, sd, betas.sigma);

  // ── Half WP ──
  const halfLengthSec = defs.gameLengthSec / 2;
  const periodsPerHalf = Math.ceil(defs.periodsPerGame / 2);
  const currentQuarter = input.quarter ?? Math.max(1, Math.ceil((defs.gameLengthSec - timeRemaining) / (defs.gameLengthSec / defs.periodsPerGame)));
  const inFirstHalf = currentQuarter <= periodsPerHalf;
  const timeLeftInHalf = inFirstHalf
    ? Math.max(timeRemaining - halfLengthSec, 1)
    : Math.min(timeRemaining, halfLengthSec);
  // Half sigma: √2 less variance (half the game)
  const halfSigma = betas.sigma / Math.sqrt(2);
  const wpHalf = wpForScope(halfLengthSec, Math.max(timeLeftInHalf, 1), sd, halfSigma);

  // ── Quarter/Period WP ──
  const periodLength = defs.gameLengthSec / defs.periodsPerGame;
  const timeInCurrentPeriod = Math.max(timeRemaining % periodLength || periodLength, 1);
  // Quarter sigma: √periods less variance
  const qtrSigma = betas.sigma / Math.sqrt(defs.periodsPerGame);
  // Quarter sd: use full sd (the question is "who wins this quarter from current state")
  const wpQuarter = wpForScope(periodLength, timeInCurrentPeriod, sd, qtrSigma);

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

/** Per-sport parameters for live WP logistic model
 * 
 * Formula: z = β1 · (sd/σ) · ln((T+1)/(t+1)) + β3 · pos · √(t/T) + β4 · √(t/T)
 * WP = 1 / (1 + e^(-z))
 * 
 * Key: ln((T+1)/(t+1)) = ln(T+1) - ln(t+1), so ln(t+1) is the core time term.
 * As t → 0, ln ratio grows → score diff matters more (game decided near end).
 * As t → T, ln ratio → 0 → WP collapses to ~50% (whole game still to play).
 */
const LIVE_BETAS: Record<Sport, {
  beta1: number;       // score-time interaction coefficient
  sigma: number;       // scoring margin std dev (normalizer)
  possession: number;  // possession value in z-score units
  home: number;        // home advantage in z-score units
}> = {
  // NBA: ~12.5 pt std dev per game
  NBA: { beta1: 1.6, sigma: 12.5, possession: 0.30, home: 0.10 },
  // NFL: ~13.5 pt std dev
  NFL: { beta1: 2.3, sigma: 13.5, possession: 0.40, home: 0.15 },
  // NHL: ~1.6 goal std dev
  NHL: { beta1: 2.2, sigma: 1.6, possession: 0.10, home: 0.10 },
  // MLB: ~2.8 run std dev
  MLB: { beta1: 2.0, sigma: 2.8, possession: 0.05, home: 0.08 },
};

// ─── Quarter Predictions ──────────────────────────────────────────────────────

/**
 * Generate per-quarter win probability and fair ML for all periods.
 * Uses pregame ratings to estimate per-period scoring expectations.
 */
export function computeQuarterPredictions(
  pregame: PregameOutput,
  sport: Sport,
  numPeriods?: number,
  homePeriodAvgs?: PeriodAverages[],
  awayPeriodAvgs?: PeriodAverages[],
): QuarterPrediction[] {
  const defs = SPORT_DEFAULTS[sport];
  const periods = numPeriods ?? defs.periodsPerGame;
  const predictions: QuarterPrediction[] = [];

  const periodLabels = sport === "NHL"
    ? ["P1", "P2", "P3"]
    : sport === "MLB"
    ? Array.from({ length: 9 }, (_, i) => `${i + 1}`)
    : ["Q1", "Q2", "Q3", "Q4"];

  for (let q = 1; q <= periods; q++) {
    const label = periodLabels[q - 1] || `Q${q}`;
    const periodKey = label;

    // Try to use period averages if available
    const hAvg = homePeriodAvgs?.find(p => p.period === periodKey);
    const aAvg = awayPeriodAvgs?.find(p => p.period === periodKey);

    let muHomeQ: number, muAwayQ: number;

    if (hAvg && aAvg) {
      // Use actual period averages: adjust for opponent
      muHomeQ = (hAvg.avgPoints + aAvg.avgPointsAllowed) / 2;
      muAwayQ = (aAvg.avgPoints + hAvg.avgPointsAllowed) / 2;
    } else {
      // Fallback: divide full-game projection evenly with Q1/Q4 factors
      const qFactor = q === 1 ? 1.05 : q === periods ? 0.95 : 1.0;
      muHomeQ = (pregame.muHome / periods) * qFactor;
      muAwayQ = (pregame.muAway / periods) * qFactor;
    }

    const muTotalQ = muHomeQ + muAwayQ;
    const muSpreadQ = muHomeQ - muAwayQ;
    const sigmaQ = (sport === "NHL" || sport === "MLB")
      ? Math.sqrt(muTotalQ)
      : defs.sigma / Math.sqrt(periods) * 0.8;
    
    const wpHome = normCDF(muSpreadQ / Math.max(sigmaQ, 0.5));

    predictions.push({
      quarter: q,
      label,
      muHome: +muHomeQ.toFixed(1),
      muAway: +muAwayQ.toFixed(1),
      muTotal: +muTotalQ.toFixed(1),
      muSpread: +muSpreadQ.toFixed(1),
      wpHome: +wpHome.toFixed(4),
      fairMLHome: wpToAmericanOdds(wpHome),
      fairMLAway: wpToAmericanOdds(1 - wpHome),
    });
  }

  // Also add half predictions
  const halfLabels = sport === "NHL" ? [] : ["1H", "2H"];
  for (const halfLabel of halfLabels) {
    const hAvg = homePeriodAvgs?.find(p => p.period === halfLabel);
    const aAvg = awayPeriodAvgs?.find(p => p.period === halfLabel);

    let muHomeH: number, muAwayH: number;

    if (hAvg && aAvg) {
      muHomeH = (hAvg.avgPoints + aAvg.avgPointsAllowed) / 2;
      muAwayH = (aAvg.avgPoints + hAvg.avgPointsAllowed) / 2;
    } else {
      muHomeH = pregame.muHome / 2;
      muAwayH = pregame.muAway / 2;
    }

    const muTotalH = muHomeH + muAwayH;
    const muSpreadH = muHomeH - muAwayH;
    const sigmaH = defs.sigma / Math.sqrt(2) * 0.8;
    const wpHome = normCDF(muSpreadH / Math.max(sigmaH, 0.5));

    predictions.push({
      quarter: halfLabel === "1H" ? 10 : 11, // special identifiers
      label: halfLabel,
      muHome: +muHomeH.toFixed(1),
      muAway: +muAwayH.toFixed(1),
      muTotal: +muTotalH.toFixed(1),
      muSpread: +muSpreadH.toFixed(1),
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
