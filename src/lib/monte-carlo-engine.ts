/**
 * Monte Carlo Prop Simulation Engine
 * 
 * Generates 10,000 simulations per player using Box-Muller normal distribution.
 * Calculates probability over/under any prop line and edge vs implied odds.
 */

// ─── Box-Muller Normal Distribution ───
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
}

function simulateStat(projected: number, std: number): number {
  return Math.max(0, projected + std * randn());
}

// ─── Fantasy Score Formula ───
export function fantasyPoints(pts: number, reb: number, ast: number, stl: number, blk: number, to: number): number {
  return pts + 1.2 * reb + 1.5 * ast + 3 * stl + 3 * blk - to;
}

// ─── Types ───
export interface PlayerProjection {
  player_name: string;
  projected_points: number;
  projected_rebounds: number;
  projected_assists: number;
  projected_steals: number;
  projected_blocks: number;
  projected_turnovers: number;
  std_points: number;
  std_rebounds: number;
  std_assists: number;
  std_steals: number;
  std_blocks: number;
  std_turnovers: number;
}

export interface PropLine {
  stat_type: string;
  line: number;
  over_odds?: number;   // American odds e.g. -110
  under_odds?: number;
}

export interface SimulationResult {
  player_name: string;
  stat_type: string;
  line: number;
  projected_value: number;
  prob_over: number;
  prob_under: number;
  edge_over: number;
  edge_under: number;
  implied_prob_over: number;
  implied_prob_under: number;
  percentile_10: number;
  percentile_25: number;
  percentile_50: number;
  percentile_75: number;
  percentile_90: number;
  fantasy_points_mean: number;
  num_simulations: number;
}

// ─── Convert American odds to implied probability ───
export function americanToImpliedProb(odds: number | null | undefined): number {
  if (odds == null) return 0.524; // default -110 implied
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

// ─── Get stat value from a simulation ───
function getSimStat(
  statType: string,
  pts: number, reb: number, ast: number, stl: number, blk: number, to: number
): number {
  switch (statType) {
    case "points": return pts;
    case "rebounds": return reb;
    case "assists": return ast;
    case "steals": return stl;
    case "blocks": return blk;
    case "turnovers": return to;
    case "pts_reb_ast": return pts + reb + ast;
    case "pts_reb": return pts + reb;
    case "pts_ast": return pts + ast;
    case "reb_ast": return reb + ast;
    case "steals_blocks": return stl + blk;
    case "fantasy_points": return fantasyPoints(pts, reb, ast, stl, blk, to);
    default: return pts;
  }
}

// ─── Get projected stat from projection ───
function getProjectedStat(statType: string, proj: PlayerProjection): number {
  switch (statType) {
    case "points": return proj.projected_points;
    case "rebounds": return proj.projected_rebounds;
    case "assists": return proj.projected_assists;
    case "steals": return proj.projected_steals;
    case "blocks": return proj.projected_blocks;
    case "turnovers": return proj.projected_turnovers;
    case "pts_reb_ast": return proj.projected_points + proj.projected_rebounds + proj.projected_assists;
    case "pts_reb": return proj.projected_points + proj.projected_rebounds;
    case "pts_ast": return proj.projected_points + proj.projected_assists;
    case "reb_ast": return proj.projected_rebounds + proj.projected_assists;
    case "steals_blocks": return proj.projected_steals + proj.projected_blocks;
    case "fantasy_points": return fantasyPoints(
      proj.projected_points, proj.projected_rebounds, proj.projected_assists,
      proj.projected_steals, proj.projected_blocks, proj.projected_turnovers
    );
    default: return proj.projected_points;
  }
}

// ─── Run Monte Carlo Simulation ───
export function runSimulation(
  projection: PlayerProjection,
  propLine: PropLine,
  numSims: number = 10_000,
): SimulationResult {
  const values: number[] = new Array(numSims);
  let fptsList: number[] = new Array(numSims);
  let overCount = 0;

  for (let i = 0; i < numSims; i++) {
    const pts = simulateStat(projection.projected_points, projection.std_points);
    const reb = simulateStat(projection.projected_rebounds, projection.std_rebounds);
    const ast = simulateStat(projection.projected_assists, projection.std_assists);
    const stl = simulateStat(projection.projected_steals, projection.std_steals);
    const blk = simulateStat(projection.projected_blocks, projection.std_blocks);
    const to = simulateStat(projection.projected_turnovers, projection.std_turnovers);

    const statVal = getSimStat(propLine.stat_type, pts, reb, ast, stl, blk, to);
    values[i] = statVal;
    fptsList[i] = fantasyPoints(pts, reb, ast, stl, blk, to);

    if (statVal > propLine.line) overCount++;
  }

  // Sort for percentiles
  values.sort((a, b) => a - b);
  fptsList.sort((a, b) => a - b);

  const probOver = overCount / numSims;
  const probUnder = 1 - probOver;

  const impliedOver = americanToImpliedProb(propLine.over_odds);
  const impliedUnder = americanToImpliedProb(propLine.under_odds);

  const edgeOver = probOver - impliedOver;
  const edgeUnder = probUnder - impliedUnder;

  const percentileAt = (arr: number[], p: number) => arr[Math.floor(p * arr.length)] ?? 0;
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    player_name: projection.player_name,
    stat_type: propLine.stat_type,
    line: propLine.line,
    projected_value: getProjectedStat(propLine.stat_type, projection),
    prob_over: Math.round(probOver * 1000) / 10,   // e.g. 62.3%
    prob_under: Math.round(probUnder * 1000) / 10,
    edge_over: Math.round(edgeOver * 1000) / 10,
    edge_under: Math.round(edgeUnder * 1000) / 10,
    implied_prob_over: Math.round(impliedOver * 1000) / 10,
    implied_prob_under: Math.round(impliedUnder * 1000) / 10,
    percentile_10: Math.round(percentileAt(values, 0.1) * 10) / 10,
    percentile_25: Math.round(percentileAt(values, 0.25) * 10) / 10,
    percentile_50: Math.round(percentileAt(values, 0.5) * 10) / 10,
    percentile_75: Math.round(percentileAt(values, 0.75) * 10) / 10,
    percentile_90: Math.round(percentileAt(values, 0.9) * 10) / 10,
    fantasy_points_mean: Math.round(mean(fptsList) * 10) / 10,
    num_simulations: numSims,
  };
}

// ─── Run simulations for multiple prop lines ───
export function runPlayerSimulations(
  projection: PlayerProjection,
  propLines: PropLine[],
  numSims: number = 10_000,
): SimulationResult[] {
  return propLines.map(line => runSimulation(projection, line, numSims));
}

// ─── Edge color classification ───
export function getEdgeColor(edge: number): string {
  if (edge > 5) return "text-cosmic-green";
  if (edge > 2) return "text-yellow-400";
  if (edge > 0) return "text-muted-foreground";
  return "text-destructive";
}

export function getEdgeBg(edge: number): string {
  if (edge > 5) return "bg-cosmic-green/10 border-cosmic-green/20";
  if (edge > 2) return "bg-yellow-400/10 border-yellow-400/20";
  if (edge > 0) return "bg-muted/30 border-border/20";
  return "bg-destructive/10 border-destructive/20";
}
