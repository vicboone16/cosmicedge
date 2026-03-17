/**
 * Astra Compute Gating Pipeline.
 * Enforces strict ordering:
 *   entity resolution → game resolution → variable retrieval →
 *   grain validation → sanity validation → required input validation →
 *   deterministic compute → narrative generation
 *
 * If any step before compute fails, narrative is blocked.
 */

export type StepStatus = "ok" | "partial" | "failed" | "skipped";

export interface PipelineStage {
  step: string;
  status: StepStatus;
  detail?: string;
  data?: any;
}

export interface ComputeGateState {
  entity_resolution_status: StepStatus;
  game_resolution_status: StepStatus;
  variable_retrieval_status: StepStatus;
  grain_validation_status: StepStatus;
  sanity_validation_status: StepStatus;
  required_inputs_status: StepStatus;
  deterministic_compute_status: StepStatus;
  narrative_generation_status: "allowed" | "blocked";
  block_reason?: string;
  stages: PipelineStage[];
}

export interface ComputeFailureCard {
  type: "compute_failure";
  query_target: string;
  resolved_player: { name: string; team: string; id: string } | null;
  resolved_game: { id: string; label: string } | null;
  active_model: { id: string; version: string; scope: string } | null;
  missing_variables: string[];
  invalid_variables: { key: string; value: number; reason: string }[];
  grain_mismatches: GrainMismatch[];
  compute_blocked_reason: string;
  stages: PipelineStage[];
}

// ── Grain Types ──

export type DataGrain = "player_game" | "player_season" | "player_l5" | "player_l10" | "player_l20" | "team_game" | "team_season" | "team_live" | "game_live" | "league" | "unknown";

export type ComputeContext = "player_prop" | "team_prop" | "game_total" | "moneyline" | "spread";

export interface GrainMismatch {
  variable: string;
  expected_grain: DataGrain;
  actual_grain: DataGrain;
  reason: string;
}

export interface VariableManifestEntry {
  key: string;
  value: number | string | null;
  source: string;
  grain: DataGrain;
  as_of: string | null;
}

/**
 * Defines which grains are allowed for each compute context.
 * Team-level data is explicitly allowed ONLY in team/game contexts
 * or as labeled context variables in player contexts.
 */
const ALLOWED_GRAINS: Record<ComputeContext, DataGrain[]> = {
  player_prop: ["player_game", "player_season", "player_l5", "player_l10", "player_l20"],
  team_prop: ["team_game", "team_season", "team_live", "player_season"],
  game_total: ["team_game", "team_season", "team_live", "game_live", "league"],
  moneyline: ["team_game", "team_season", "team_live", "game_live", "league"],
  spread: ["team_game", "team_season", "team_live", "game_live", "league"],
};

/** Variables explicitly allowed as team-level context in player prop compute */
const TEAM_CONTEXT_VARIABLES = new Set([
  "home_avg_pace", "away_avg_pace", "expected_possessions",
  "home_off_rating", "home_def_rating", "away_off_rating", "away_def_rating",
  "blowout_risk", "team_pace_delta", "matchup_pace_avg",
  "home_net_rating", "away_net_rating",
]);

/**
 * Validate variable grains against compute context.
 * Returns array of grain mismatches. Empty = all good.
 */
export function validateGrains(
  variables: VariableManifestEntry[],
  context: ComputeContext,
): GrainMismatch[] {
  const allowed = ALLOWED_GRAINS[context] ?? [];
  const mismatches: GrainMismatch[] = [];

  for (const v of variables) {
    if (v.grain === "unknown") continue; // can't validate unknown grain
    if (v.value === null || v.value === undefined) continue; // skip missing

    // Allow team-level context variables in player_prop compute
    if (context === "player_prop" && TEAM_CONTEXT_VARIABLES.has(v.key)) continue;

    if (!allowed.includes(v.grain)) {
      mismatches.push({
        variable: v.key,
        expected_grain: allowed[0] ?? "unknown",
        actual_grain: v.grain,
        reason: `Variable "${v.key}" has grain "${v.grain}" but context "${context}" requires one of: ${allowed.join(", ")}`,
      });
    }
  }

  return mismatches;
}

/**
 * Check if narrative generation should be allowed.
 * STRICT: blocks on entity resolution failure, game resolution failure,
 * sanity failure, and required inputs failure.
 */
export function shouldAllowNarrative(state: ComputeGateState): boolean {
  if (state.entity_resolution_status === "failed") return false;
  if (state.game_resolution_status === "failed") return false;
  if (state.sanity_validation_status === "failed") return false;
  if (state.required_inputs_status === "failed") return false;
  if (state.variable_retrieval_status === "failed") return false;
  // Grain mismatch is a hard block
  if (state.grain_validation_status === "failed") return false;
  return true;
}

/** Build a compute failure card for UI rendering */
export function buildFailureCard(
  queryTarget: string,
  state: ComputeGateState,
  player: { name: string; team: string; id: string } | null,
  game: { id: string; label: string } | null,
  model: { id: string; version: string; scope: string } | null,
  missingVars: string[],
  invalidVars: { key: string; value: number; reason: string }[],
  grainMismatches: GrainMismatch[],
): ComputeFailureCard {
  return {
    type: "compute_failure",
    query_target: queryTarget,
    resolved_player: player,
    resolved_game: game,
    active_model: model,
    missing_variables: missingVars,
    invalid_variables: invalidVars,
    grain_mismatches: grainMismatches,
    compute_blocked_reason: state.block_reason || "Unknown failure in compute pipeline",
    stages: state.stages,
  };
}

/** Create initial empty gate state */
export function createGateState(): ComputeGateState {
  return {
    entity_resolution_status: "skipped",
    game_resolution_status: "skipped",
    variable_retrieval_status: "skipped",
    grain_validation_status: "skipped",
    sanity_validation_status: "skipped",
    required_inputs_status: "skipped",
    deterministic_compute_status: "skipped",
    narrative_generation_status: "blocked",
    stages: [],
  };
}

/** Run the full gating pipeline and return the state */
export function runGatingPipeline(params: {
  playerResolved: boolean;
  playerName?: string;
  gameResolved: boolean;
  gameLabel?: string;
  variablesRetrieved: number;
  variablesRequired: number;
  sanityViolations: { key: string; value: number; reason: string }[];
  grainMismatches: GrainMismatch[];
  queryType: string;
}): ComputeGateState {
  const state = createGateState();

  // Step 1: Entity resolution
  const needsPlayer = ["player_prop", "comparison"].includes(params.queryType);
  if (needsPlayer) {
    state.entity_resolution_status = params.playerResolved ? "ok" : "failed";
    state.stages.push({
      step: "Entity Resolution",
      status: state.entity_resolution_status,
      detail: params.playerResolved ? (params.playerName || "Resolved") : "Player not found",
    });
  } else {
    state.entity_resolution_status = "ok";
    state.stages.push({ step: "Entity Resolution", status: "ok", detail: "Not required for this query type" });
  }

  // Step 2: Game resolution
  const needsGame = ["player_prop", "moneyline", "spread", "total", "team_total"].includes(params.queryType);
  if (needsGame) {
    state.game_resolution_status = params.gameResolved ? "ok" : "partial";
    state.stages.push({
      step: "Game Resolution",
      status: state.game_resolution_status,
      detail: params.gameResolved ? (params.gameLabel || "Resolved") : "No active game found",
    });
  } else {
    state.game_resolution_status = "ok";
    state.stages.push({ step: "Game Resolution", status: "ok", detail: "Not required" });
  }

  // Step 3: Variable retrieval
  if (params.variablesRequired > 0) {
    const ratio = params.variablesRetrieved / params.variablesRequired;
    state.variable_retrieval_status = ratio >= 0.8 ? "ok" : ratio >= 0.3 ? "partial" : "failed";
    state.stages.push({
      step: "Variable Retrieval",
      status: state.variable_retrieval_status,
      detail: `${params.variablesRetrieved}/${params.variablesRequired} variables`,
    });
  } else {
    state.variable_retrieval_status = "ok";
    state.stages.push({ step: "Variable Retrieval", status: "ok", detail: "No variables required" });
  }

  // Step 4: Grain validation — hard block with detailed reasons
  if (params.grainMismatches.length > 0) {
    state.grain_validation_status = "failed";
    const firstMismatch = params.grainMismatches[0];
    state.stages.push({
      step: "Grain Validation",
      status: "failed",
      detail: `${params.grainMismatches.length} mismatches: ${firstMismatch.reason}`,
    });
  } else {
    state.grain_validation_status = "ok";
    state.stages.push({ step: "Grain Validation", status: "ok", detail: "All variable grains valid for context" });
  }

  // Step 5: Sanity validation
  state.sanity_validation_status = params.sanityViolations.length === 0 ? "ok" : "failed";
  state.stages.push({
    step: "Sanity Validation",
    status: state.sanity_validation_status,
    detail: params.sanityViolations.length > 0
      ? `${params.sanityViolations.length} violations: ${params.sanityViolations.map(v => v.key).join(", ")}`
      : "All values in range",
  });

  // Step 6: Required inputs
  if (state.entity_resolution_status === "failed") {
    state.required_inputs_status = "failed";
    state.block_reason = "Player could not be resolved";
  } else if (state.variable_retrieval_status === "failed") {
    state.required_inputs_status = "failed";
    state.block_reason = "Insufficient variables for compute";
  } else {
    state.required_inputs_status = "ok";
  }
  state.stages.push({
    step: "Required Inputs",
    status: state.required_inputs_status,
    detail: state.block_reason || "All required inputs present",
  });

  // Step 7: Determine if narrative is allowed
  const allowed = shouldAllowNarrative(state);
  state.narrative_generation_status = allowed ? "allowed" : "blocked";

  if (!allowed && !state.block_reason) {
    if (state.grain_validation_status === "failed") {
      const first = params.grainMismatches[0];
      state.block_reason = `Grain mismatch: "${first.variable}" is ${first.actual_grain}, expected ${first.expected_grain} for this compute context`;
    } else if (state.sanity_validation_status === "failed") {
      state.block_reason = "Sanity check failed — impossible stat values detected";
    } else {
      state.block_reason = "Pipeline validation failed";
    }
  }

  state.stages.push({
    step: "Narrative Generation",
    status: allowed ? "ok" : "failed",
    detail: allowed ? "Allowed" : `Blocked: ${state.block_reason}`,
  });

  return state;
}
