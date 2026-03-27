/**
 * Monte Carlo Prop Simulation Utility
 *
 * Standalone functions matching the requested API surface.
 * Uses Box-Muller normal distribution for 10,000 simulations.
 */

// ─── Box-Muller normal variate ───
function boxMuller(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
}

/** Run N simulations for a single stat. Returns array of simulated values. */
export function runSimulations(
  projected: number,
  stdDev: number,
  numSims: number = 10_000,
): number[] {
  const results = new Array<number>(numSims);
  for (let i = 0; i < numSims; i++) {
    results[i] = Math.max(0, projected + stdDev * boxMuller());
  }
  return results;
}

/** Calculate probability over/under a given line from simulation array. */
export function calcProbability(
  sims: number[],
  line: number,
): { over: number; under: number } {
  let overCount = 0;
  for (let i = 0; i < sims.length; i++) {
    if (sims[i] > line) overCount++;
  }
  const over = overCount / sims.length;
  return { over, under: 1 - over };
}

/** Edge = model probability − implied probability. Positive = value bet. */
export function calcEdge(modelProb: number, impliedProb: number): number {
  return modelProb - impliedProb;
}

/**
 * Fantasy score formula:
 * FPTS = PTS + 1.2*REB + 1.5*AST + 3*STL + 3*BLK − TO
 */
export function calcFantasyScore(
  pts: number,
  reb: number,
  ast: number,
  stl: number,
  blk: number,
  to: number,
): number {
  return pts + 1.2 * reb + 1.5 * ast + 3 * stl + 3 * blk - to;
}

/**
 * Convert American odds to implied probability.
 *   -110 → 110/(110+100) = 0.524
 *   +150 → 100/(150+100) = 0.400
 */
export function impliedProbFromAmericanOdds(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}
