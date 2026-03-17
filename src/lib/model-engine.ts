/**
 * Client-side model execution engine.
 * Runs simple weighted-factor models in the browser.
 * Complex models (Monte Carlo, backtests) delegate to edge functions.
 */

import { supabase } from "@/integrations/supabase/client";
import { FACTOR_LIBRARY, type FactorConfig } from "@/lib/model-factors";

export interface ModelInput {
  factorKey: string;
  factorName: string;
  rawValue: number | null;
  weight: number;
  weightedValue: number;
  source: string;
}

export interface ModelOutput {
  projection: number;
  confidence: number;
  confidenceTier: "S" | "A" | "B" | "C";
  pick: string;
  edge: number;
  probability: number;
  explanation: string;
}

export interface PredictionResult {
  modelName: string;
  modelId?: string;
  inputs: ModelInput[];
  output: ModelOutput;
  trace: string[];
  timestamp: string;
}

/* ── Fetch live factor values for a player ── */
export async function fetchPlayerFactors(
  playerId: string,
  statKey: string,
  gameId?: string
): Promise<Record<string, number>> {
  const values: Record<string, number> = {};

  try {
    // Fetch player game stats for rolling averages, ordered by game date not created_at
    const { data: gameStats } = await supabase
      .from("player_game_stats")
      .select("points, rebounds, assists, steals, blocks, three_made, turnovers, fg_attempted, minutes, game_id, games!inner(start_time, status)")
      .eq("player_id", playerId)
      .eq("period", "full")
      .eq("games.status", "final")
      .order("games(start_time)", { ascending: false } as any)
      .limit(30);

    if (gameStats?.length) {
      const statValues = gameStats.map((g: any) => extractStat(g, statKey));
      const last5 = statValues.slice(0, 5);
      const last10 = statValues.slice(0, 10);

      values.season_avg = avg(statValues);
      values.last_5_avg = avg(last5);
      values.last_10_avg = avg(last10);
      values.volatility = stdDev(last10);
      values.consistency = values.season_avg > 0 ? 1 - (values.volatility / values.season_avg) : 0;

      // Momentum: L5 vs L10 trend
      const l5avg = avg(last5);
      const l10avg = avg(last10);
      values.momentum = l10avg > 0 ? (l5avg - l10avg) / l10avg : 0;

      // Streak: consecutive overs (positive) or unders (negative) vs season avg
      let streak = 0;
      const line = values.season_avg;
      for (const v of statValues) {
        if (v > line) { if (streak >= 0) streak++; else break; }
        else { if (streak <= 0) streak--; else break; }
      }
      values.streak_score = streak;

      // Usage shift: FGA proxy
      const fga = gameStats.map((g: any) => g.fg_attempted ?? 0);
      const fgaL10 = avg(fga.slice(0, 10));
      const fgaSeason = avg(fga);
      values.usage_shift = fgaSeason > 0 ? (fgaL10 - fgaSeason) / fgaSeason : 0;
    }

    // Fetch game environment data if we have a game
    if (gameId) {
      const { data: game } = await supabase
        .from("games")
        .select("home_abbr, away_abbr, league")
        .eq("id", gameId)
        .single();

      if (game) {
        // Get player team
        const { data: player } = await supabase
          .from("players")
          .select("team")
          .eq("id", playerId)
          .single();

        const oppAbbr = player?.team === game.home_abbr ? game.away_abbr : game.home_abbr;

        // Fetch pace data for both teams
        const { data: paceData } = await supabase
          .from("team_season_pace")
          .select("team_abbr, avg_pace, off_rating, def_rating, net_rating")
          .in("team_abbr", [game.home_abbr, game.away_abbr]);

        if (paceData?.length) {
          const teamPace = paceData.find((p: any) => p.team_abbr === player?.team);
          const oppPace = paceData.find((p: any) => p.team_abbr === oppAbbr);

          values.pace = ((teamPace?.avg_pace ?? 100) + (oppPace?.avg_pace ?? 100)) / 2;
          values.off_rating = teamPace?.off_rating ?? 110;
          values.def_rating = oppPace?.def_rating ?? 110;
          values.blowout_risk = Math.min(1, Math.abs((teamPace?.net_rating ?? 0) - (oppPace?.net_rating ?? 0)) / 30);
        }
      }
    }
  } catch (e) {
    console.error("Factor fetch error:", e);
  }

  return values;
}

/* ── Run a model with given factors and values ── */
export function executeModel(
  factors: FactorConfig[],
  values: Record<string, number>,
  line: number,
  modelName: string,
  modelId?: string
): PredictionResult {
  const trace: string[] = [];
  const inputs: ModelInput[] = [];
  const enabledFactors = factors.filter((f) => f.enabled);

  if (!enabledFactors.length) {
    return {
      modelName, modelId,
      inputs: [],
      output: { projection: 0, confidence: 0, confidenceTier: "C", pick: "N/A", edge: 0, probability: 0.5, explanation: "No factors enabled." },
      trace: ["No factors enabled"],
      timestamp: new Date().toISOString(),
    };
  }

  const totalWeight = enabledFactors.reduce((s, f) => s + f.weight, 0);
  trace.push(`Total weight: ${totalWeight} across ${enabledFactors.length} factors`);

  // ── Step 1: Weighted base projection ──
  let baseProjection = 0;
  const baseFKeys = ["season_avg", "last_10_avg", "last_5_avg"];
  const baseFacts = enabledFactors.filter((f) => baseFKeys.includes(f.key));

  if (baseFacts.length) {
    const baseWeight = baseFacts.reduce((s, f) => s + f.weight, 0);
    for (const f of baseFacts) {
      const val = values[f.key] ?? 0;
      const contribution = baseWeight > 0 ? (val * f.weight) / baseWeight : 0;
      baseProjection += contribution;
      const meta = FACTOR_LIBRARY.find((fl) => fl.key === f.key);
      inputs.push({ factorKey: f.key, factorName: meta?.name ?? f.key, rawValue: val, weight: f.weight, weightedValue: contribution, source: meta?.source ?? "computed" });
      trace.push(`  ${meta?.name}: ${val.toFixed(2)} × w${f.weight} → ${contribution.toFixed(2)}`);
    }
    trace.push(`Base projection: ${baseProjection.toFixed(2)}`);
  } else {
    baseProjection = values.season_avg ?? line;
    trace.push(`No base factors; using season avg: ${baseProjection.toFixed(2)}`);
  }

  // ── Step 2: Adjustment multipliers ──
  let adjustmentMultiplier = 1.0;
  const adjustmentFKeys = enabledFactors.filter((f) => !baseFKeys.includes(f.key));

  for (const f of adjustmentFKeys) {
    const rawVal = values[f.key] ?? 0;
    const normalizedWeight = totalWeight > 0 ? f.weight / totalWeight : 0;
    let modifier = 0;
    const meta = FACTOR_LIBRARY.find((fl) => fl.key === f.key);

    // Different normalization per factor type
    switch (f.key) {
      case "pace":
        modifier = ((rawVal - 100) / 100) * normalizedWeight; // pace relative to league avg
        break;
      case "off_rating":
      case "def_rating":
        modifier = ((rawVal - 110) / 110) * normalizedWeight;
        break;
      case "momentum":
      case "usage_shift":
        modifier = rawVal * normalizedWeight * 0.5;
        break;
      case "volatility":
        modifier = -(rawVal / (baseProjection || 1)) * normalizedWeight * 0.3; // high vol = slight penalty
        break;
      case "blowout_risk":
        modifier = -rawVal * normalizedWeight * 0.2;
        break;
      case "streak_score":
        modifier = (rawVal / 10) * normalizedWeight * 0.3;
        break;
      case "matchup_diff":
      case "injuries":
      case "consistency":
        modifier = rawVal * normalizedWeight * 0.2;
        break;
      default:
        modifier = rawVal * normalizedWeight * 0.1;
        break;
    }

    adjustmentMultiplier += modifier;
    inputs.push({ factorKey: f.key, factorName: meta?.name ?? f.key, rawValue: rawVal, weight: f.weight, weightedValue: modifier, source: meta?.source ?? "weight-only" });
    trace.push(`  ${meta?.name}: raw=${rawVal.toFixed(3)}, mod=${modifier > 0 ? "+" : ""}${modifier.toFixed(4)}`);
  }

  adjustmentMultiplier = Math.max(0.7, Math.min(1.3, adjustmentMultiplier));
  trace.push(`Adjustment multiplier: ${adjustmentMultiplier.toFixed(4)}`);

  // ── Step 3: Final projection ──
  const projection = baseProjection * adjustmentMultiplier;
  trace.push(`Final projection: ${baseProjection.toFixed(2)} × ${adjustmentMultiplier.toFixed(4)} = ${projection.toFixed(2)}`);

  // ── Step 4: Edge and probability ──
  const sigma = values.volatility ?? ((baseProjection * 0.25) || 1);
  const edge = projection - line;
  const z = edge / sigma;
  const probability = logisticCdf(z * 1.5);
  trace.push(`Edge: ${projection.toFixed(2)} - ${line} = ${edge.toFixed(2)}`);
  trace.push(`σ = ${sigma.toFixed(2)}, z = ${z.toFixed(3)}, P(Over) = ${(probability * 100).toFixed(1)}%`);

  // ── Step 5: Confidence tier ──
  const absEdgePct = Math.abs(edge / (line || 1));
  const confidenceScore = Math.min(100, Math.round(absEdgePct * 200 + probability * 30));
  const confidenceTier: "S" | "A" | "B" | "C" =
    confidenceScore >= 75 ? "S" : confidenceScore >= 55 ? "A" : confidenceScore >= 35 ? "B" : "C";

  const pick = edge > 0 ? "OVER" : edge < 0 ? "UNDER" : "HOLD";
  const explanation = buildExplanation(projection, line, edge, probability, confidenceTier, enabledFactors.length, modelName);

  return {
    modelName, modelId,
    inputs,
    output: {
      projection: round(projection, 2),
      confidence: confidenceScore,
      confidenceTier,
      pick,
      edge: round(edge, 2),
      probability: round(probability, 4),
      explanation,
    },
    trace,
    timestamp: new Date().toISOString(),
  };
}

/* ── Helpers ── */
function extractStat(row: any, statKey: string): number {
  switch (statKey) {
    case "points": return row.points ?? 0;
    case "rebounds": return row.rebounds ?? 0;
    case "assists": return row.assists ?? 0;
    case "steals": return row.steals ?? 0;
    case "blocks": return row.blocks ?? 0;
    case "threes": return row.three_made ?? 0;
    case "turnovers": return row.turnovers ?? 0;
    case "pts_reb_ast": return (row.points ?? 0) + (row.rebounds ?? 0) + (row.assists ?? 0);
    case "pts_reb": return (row.points ?? 0) + (row.rebounds ?? 0);
    case "pts_ast": return (row.points ?? 0) + (row.assists ?? 0);
    case "reb_ast": return (row.rebounds ?? 0) + (row.assists ?? 0);
    default: return row.points ?? 0;
  }
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function logisticCdf(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function buildExplanation(
  projection: number, line: number, edge: number,
  probability: number, tier: string, factorCount: number, modelName: string
): string {
  const dir = edge > 0 ? "over" : "under";
  const pct = (probability * 100).toFixed(1);
  const absEdge = Math.abs(edge).toFixed(1);

  return `**${modelName}** projects **${projection.toFixed(1)}** against a line of **${line}**, ` +
    `giving a **${absEdge}-point edge ${dir}** with **${pct}% probability**. ` +
    `Confidence tier: **${tier}**. ` +
    `This projection uses ${factorCount} active factors with weighted adjustments for game environment and player trends.`;
}

/* ── Stat key options ── */
export const STAT_KEYS = [
  { value: "points", label: "Points" },
  { value: "rebounds", label: "Rebounds" },
  { value: "assists", label: "Assists" },
  { value: "steals", label: "Steals" },
  { value: "blocks", label: "Blocks" },
  { value: "threes", label: "3-Pointers" },
  { value: "turnovers", label: "Turnovers" },
  { value: "pts_reb_ast", label: "PRA" },
  { value: "pts_reb", label: "Pts + Reb" },
  { value: "pts_ast", label: "Pts + Ast" },
  { value: "reb_ast", label: "Reb + Ast" },
];
