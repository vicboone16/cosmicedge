/**
 * Factor library for the Custom Model Builder.
 * Each factor defines a named weight that can be toggled and adjusted.
 * "hybrid" factors have live data sources; others are weight-only placeholders.
 */

export interface ModelFactor {
  key: string;
  name: string;
  description: string;
  category: "base" | "environment" | "adjustment" | "astro" | "advanced";
  defaultWeight: number;
  source?: string;       // DB table/view for live data
  sourceMetric?: string;  // Column or computed field
  live: boolean;          // true = pulls real data, false = weight-only
}

export const FACTOR_LIBRARY: ModelFactor[] = [
  // ── Base Projection ──
  { key: "season_avg",       name: "Season Average",       description: "Full-season stat mean",                       category: "base", defaultWeight: 50, source: "player_season_stats", sourceMetric: "avg", live: true },
  { key: "last_10_avg",      name: "Last 10 Average",      description: "Rolling 10-game stat mean",                   category: "base", defaultWeight: 30, source: "player_game_stats",   sourceMetric: "rolling_10", live: true },
  { key: "last_5_avg",       name: "Last 5 Average",       description: "Rolling 5-game stat mean",                    category: "base", defaultWeight: 20, source: "player_game_stats",   sourceMetric: "rolling_5", live: true },
  { key: "home_away_split",  name: "Home/Away Split",      description: "Performance delta based on game location",    category: "base", defaultWeight: 10, live: true },
  { key: "volatility",       name: "Volatility (σ)",       description: "Standard deviation of recent performance",    category: "base", defaultWeight: 5,  live: true },

  // ── Environment ──
  { key: "pace",             name: "Pace",                 description: "Expected game possessions per 48 min",        category: "environment", defaultWeight: 15, source: "team_season_pace", sourceMetric: "avg_pace", live: true },
  { key: "off_rating",       name: "Offensive Rating",     description: "Team points per 100 possessions",             category: "environment", defaultWeight: 10, source: "team_season_pace", sourceMetric: "off_rating", live: true },
  { key: "def_rating",       name: "Defensive Rating",     description: "Opponent points per 100 possessions allowed", category: "environment", defaultWeight: 10, source: "team_season_pace", sourceMetric: "def_rating", live: true },
  { key: "live_pace",        name: "Live Game Pace",       description: "Current in-game pace vs expectation",         category: "environment", defaultWeight: 5, live: false },
  { key: "blowout_risk",     name: "Blowout Risk",         description: "Probability of lopsided game script",         category: "environment", defaultWeight: 5, live: true },

  // ── Adjustment ──
  { key: "momentum",         name: "Momentum / Streak",    description: "Recent performance trend direction",          category: "adjustment", defaultWeight: 10, live: true },
  { key: "usage_shift",      name: "Usage Shift",          description: "Recent usage rate change vs baseline",        category: "adjustment", defaultWeight: 8, live: true },
  { key: "matchup_diff",     name: "Matchup Difficulty",   description: "Opponent strength at defending this stat",     category: "adjustment", defaultWeight: 12, source: "ce_matchup_difficulty", live: true },
  { key: "injuries",         name: "Injury Impact",        description: "Teammate injuries affecting opportunity",      category: "adjustment", defaultWeight: 10, source: "ce_injury_status", live: true },
  { key: "rest_days",        name: "Rest Days",            description: "Days since last game",                        category: "adjustment", defaultWeight: 5, live: false },
  { key: "line_movement",    name: "Line Movement",        description: "Opening vs current line delta",               category: "adjustment", defaultWeight: 8, live: false },

  // ── Astro ──
  { key: "astro_overlay",    name: "Astro Overlay",        description: "Composite planetary influence modifier",      category: "astro", defaultWeight: 5, live: false },
  { key: "transit_score",    name: "Transit Score",        description: "Active transit aspects affecting performance", category: "astro", defaultWeight: 5, live: false },
  { key: "planetary_hour",   name: "Planetary Hour",       description: "Ruling planet at game time",                  category: "astro", defaultWeight: 3, live: false },
  { key: "mars_boost",       name: "Mars Boost",           description: "Mars transit amplifying athletic output",      category: "astro", defaultWeight: 3, source: "ce_astro_overrides", live: true },
  { key: "mercury_chaos",    name: "Mercury Chaos",        description: "Mercury retrograde variance modifier",        category: "astro", defaultWeight: 2, source: "ce_astro_overrides", live: true },

  // ── Advanced ──
  { key: "correlation",      name: "Stat Correlation",     description: "Interdependence between related stats",       category: "advanced", defaultWeight: 5, live: false },
  { key: "consistency",      name: "Consistency Score",    description: "1 - (σ / μ), higher = more predictable",      category: "advanced", defaultWeight: 5, live: true },
  { key: "streak_score",     name: "Streak Score",         description: "Consecutive over/under hit count",            category: "advanced", defaultWeight: 5, live: true },
  { key: "game_script",      name: "Game Script",          description: "Predicted game environment probabilities",    category: "advanced", defaultWeight: 8, live: false },
];

export const MARKET_TYPES = [
  { value: "player_prop",  label: "Player Prop" },
  { value: "spread",       label: "Spread" },
  { value: "moneyline",    label: "Moneyline" },
  { value: "total",        label: "Total (O/U)" },
  { value: "team_total",   label: "Team Total" },
  { value: "first_half",   label: "1st Half" },
  { value: "first_quarter", label: "1st Quarter" },
] as const;

export const TARGET_OUTPUTS = [
  { value: "over_under",      label: "Over/Under" },
  { value: "projected_stat",  label: "Projected Stat Line" },
  { value: "win_probability", label: "Win Probability" },
  { value: "spread_pick",     label: "Spread Pick" },
  { value: "moneyline_pick",  label: "Moneyline Pick" },
  { value: "confidence",      label: "Confidence Score" },
  { value: "expected_roi",    label: "Expected ROI" },
  { value: "hit_rate",        label: "Hit Rate" },
] as const;

export const SPORTS = [
  { value: "NBA", label: "NBA" },
  { value: "NFL", label: "NFL" },
  { value: "NHL", label: "NHL" },
  { value: "MLB", label: "MLB" },
] as const;

export type FactorConfig = {
  key: string;
  weight: number;
  enabled: boolean;
};

export type CustomModelData = {
  name: string;
  description: string;
  sport: string;
  market_type: string;
  target_output: string;
  factors: FactorConfig[];
  tags: string[];
  notes: string;
};

export function buildDefaultFactors(): FactorConfig[] {
  return FACTOR_LIBRARY.map((f) => ({
    key: f.key,
    weight: f.defaultWeight,
    enabled: f.category === "base" || f.category === "environment",
  }));
}
