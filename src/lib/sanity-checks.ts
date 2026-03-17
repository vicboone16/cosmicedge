/**
 * Sanity validation for player stats and model variables.
 * Blocks impossible values from entering compute pipelines.
 */

export interface SanityLimit {
  min: number;
  max: number;
  label: string;
}

/** Hard limits for per-game player stats */
export const PLAYER_STAT_LIMITS: Record<string, SanityLimit> = {
  points: { min: 0, max: 80, label: "Points" },
  points_per_game: { min: 0, max: 60, label: "PPG" },
  rebounds: { min: 0, max: 35, label: "Rebounds" },
  rebounds_per_game: { min: 0, max: 30, label: "RPG" },
  assists: { min: 0, max: 30, label: "Assists" },
  assists_per_game: { min: 0, max: 20, label: "APG" },
  steals: { min: 0, max: 12, label: "Steals" },
  blocks: { min: 0, max: 15, label: "Blocks" },
  three_made: { min: 0, max: 16, label: "3PM" },
  turnovers: { min: 0, max: 15, label: "Turnovers" },
  minutes: { min: 0, max: 60, label: "Minutes" },
  minutes_l10_avg: { min: 0, max: 48, label: "Minutes L10 Avg" },
  fg_pct: { min: 0, max: 100, label: "FG%" },
  three_pct: { min: 0, max: 100, label: "3P%" },
  ft_pct: { min: 0, max: 100, label: "FT%" },
  usage_rate: { min: 0, max: 50, label: "USG%" },
  points_l10_avg: { min: 0, max: 60, label: "Pts L10" },
  rebounds_l10_avg: { min: 0, max: 30, label: "Reb L10" },
  assists_l10_avg: { min: 0, max: 20, label: "Ast L10" },
};

/** Team-level limits */
export const TEAM_STAT_LIMITS: Record<string, SanityLimit> = {
  avg_pace: { min: 80, max: 120, label: "Pace" },
  off_rating: { min: 85, max: 135, label: "ORtg" },
  def_rating: { min: 85, max: 135, label: "DRtg" },
  net_rating: { min: -25, max: 25, label: "NetRtg" },
};

export type GrainType =
  | "player_game"
  | "player_season"
  | "player_last_n"
  | "player_live"
  | "team_game"
  | "team_season"
  | "team_last_n"
  | "team_live"
  | "opponent_allowed_last_n"
  | "simulation_output"
  | "scorecard_output"
  | "manual_override";

export interface ValidatedVariable {
  key: string;
  value: number | null;
  source_table: string;
  grain: GrainType;
  aggregation: string;
  as_of: string;
  valid: boolean;
  invalid_reason?: string;
}

export interface SanityResult {
  valid: boolean;
  violations: { key: string; value: number; limit: SanityLimit; reason: string }[];
  validated_count: number;
}

/** Validate a set of variables against sanity limits */
export function validateVariables(vars: Record<string, number>): SanityResult {
  const violations: SanityResult["violations"] = [];
  let count = 0;

  for (const [key, value] of Object.entries(vars)) {
    if (value == null || typeof value !== "number" || isNaN(value)) continue;
    count++;

    const limit = PLAYER_STAT_LIMITS[key] ?? TEAM_STAT_LIMITS[key];
    if (!limit) continue;

    if (value < limit.min || value > limit.max) {
      violations.push({
        key,
        value,
        limit,
        reason: `${limit.label} = ${value} is outside [${limit.min}, ${limit.max}]`,
      });
    }
  }

  return { valid: violations.length === 0, violations, validated_count: count };
}

/** Check if a variable key is a team-level aggregate */
export function isTeamGrain(key: string): boolean {
  return key.startsWith("avg_pace") || key.startsWith("off_rating") || key.startsWith("def_rating") || key.startsWith("net_rating") || key.startsWith("games_played");
}

/** Prevent team aggregates from being used as player-level inputs */
export function detectGrainMismatch(
  vars: Record<string, number>,
  expectedGrain: "player" | "team"
): string[] {
  const mismatches: string[] = [];
  for (const key of Object.keys(vars)) {
    const isTeam = isTeamGrain(key);
    if (expectedGrain === "player" && isTeam) {
      mismatches.push(`${key} is team-level but expected player-level`);
    }
  }
  return mismatches;
}
