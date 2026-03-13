/**
 * Astra model-intent detection.
 * Detects when a user query is asking to run a prediction model
 * and extracts structured parameters from natural language.
 */

import { supabase } from "@/integrations/supabase/client";
import type { CustomModel } from "@/hooks/use-custom-models";

export interface ModelIntent {
  type: "run_model" | "compare_models" | "backtest_query" | "model_info";
  playerName?: string;
  statKey?: string;
  modelName?: string;
  gameMention?: string;
}

const MODEL_PATTERNS = [
  /run\s+(my\s+)?(\w[\w\s]*?)\s+(?:model|engine)\s+(?:on|for)\s+(.+)/i,
  /(?:use|try)\s+(my\s+)?(\w[\w\s]*?)\s+(?:model|engine)\s+(?:on|for)\s+(.+)/i,
  /what\s+does\s+(my\s+)?(\w[\w\s]*?)\s+(?:model|engine)\s+say\s+(?:about|for|on)\s+(.+)/i,
  /predict\s+(.+?)(?:\s+using\s+(.+?)\s+model)?$/i,
  /run\s+(?:the\s+)?(?:prop|prediction)\s+(?:model|engine)\s+(?:on|for)\s+(.+)/i,
  /(?:project|projection for)\s+(.+?)(?:'s)?\s+(points|rebounds|assists|steals|blocks|threes|pra|pts_reb_ast)/i,
];

const COMPARE_PATTERNS = [
  /compare\s+(.+?)\s+(?:vs|versus|against|and)\s+(.+?)\s+(?:for|on)\s+(.+)/i,
  /which\s+(?:model|engine)\s+(?:is\s+)?(?:best|better)\s+(?:for|on)\s+(.+)/i,
];

const STAT_ALIASES: Record<string, string> = {
  pts: "points", points: "points", scoring: "points",
  reb: "rebounds", rebounds: "rebounds", boards: "rebounds",
  ast: "assists", assists: "assists", dimes: "assists",
  stl: "steals", steals: "steals",
  blk: "blocks", blocks: "blocks",
  "3pt": "threes", threes: "threes", triples: "threes",
  pra: "pts_reb_ast", "pts+reb+ast": "pts_reb_ast",
  to: "turnovers", turnovers: "turnovers",
};

export function detectModelIntent(query: string): ModelIntent | null {
  const q = query.toLowerCase().trim();

  // Check for comparison queries
  for (const pat of COMPARE_PATTERNS) {
    const m = q.match(pat);
    if (m) return { type: "compare_models", playerName: m[3] || m[1], modelName: m[1] };
  }

  // Check for run-model queries
  for (const pat of MODEL_PATTERNS) {
    const m = q.match(pat);
    if (m) {
      // Extract stat key if mentioned
      let statKey: string | undefined;
      for (const [alias, key] of Object.entries(STAT_ALIASES)) {
        if (q.includes(alias)) { statKey = key; break; }
      }
      return {
        type: "run_model",
        playerName: m[3] || m[1],
        modelName: m[2],
        statKey,
      };
    }
  }

  // Generic model keywords
  const modelKeywords = ["model", "predict", "projection", "run my", "custom model", "backtest", "prop model"];
  if (modelKeywords.some((k) => q.includes(k))) {
    // Try to extract player name
    const playerMatch = q.match(/(?:for|on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    let statKey: string | undefined;
    for (const [alias, key] of Object.entries(STAT_ALIASES)) {
      if (q.includes(alias)) { statKey = key; break; }
    }

    if (q.includes("backtest")) return { type: "backtest_query" };

    return {
      type: "run_model",
      playerName: playerMatch?.[1],
      statKey,
    };
  }

  return null;
}

/** Try to resolve a player name to an ID */
export async function resolvePlayer(name: string): Promise<{ id: string; name: string; team: string } | null> {
  const { data } = await supabase.rpc("search_players_unaccent", {
    search_query: name.trim(),
    max_results: 1,
  });
  if (data?.length) {
    const p = data[0] as any;
    return { id: p.player_id, name: p.player_name, team: p.player_team };
  }
  return null;
}

/** Find a custom model by fuzzy name match */
export function findModelByName(name: string, models: CustomModel[]): CustomModel | null {
  const q = name.toLowerCase().trim();
  return models.find((m) => m.name.toLowerCase().includes(q)) ?? null;
}

/** Format a prediction result for chat display */
export function formatPredictionForChat(result: any): string {
  const o = result.output;
  let msg = `🎯 **${result.modelName}** Prediction\n\n`;
  msg += `**Projection:** ${o.projection} | **Line:** — | **Pick:** ${o.pick}\n`;
  msg += `**Edge:** ${o.edge > 0 ? "+" : ""}${o.edge} | **Probability:** ${(o.probability * 100).toFixed(1)}% | **Confidence:** ${o.confidenceTier}-Tier (${o.confidence})\n\n`;
  msg += o.explanation + "\n\n";
  msg += `*${result.inputs.length} factors used · ${new Date(result.timestamp).toLocaleTimeString()}*`;
  return msg;
}
