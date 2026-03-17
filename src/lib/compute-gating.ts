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
  grain_mismatches: string[];
  compute_blocked_reason: string;
  stages: PipelineStage[];
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
  // Partial variable retrieval is allowed but grain mismatch blocks
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
  grainMismatches: string[],
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
  grainMismatches: string[];
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

  // Step 4: Grain validation
  state.grain_validation_status = params.grainMismatches.length === 0 ? "ok" : "failed";
  state.stages.push({
    step: "Grain Validation",
    status: state.grain_validation_status,
    detail: params.grainMismatches.length > 0 ? `${params.grainMismatches.length} mismatches` : "Clean",
  });

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
    if (state.sanity_validation_status === "failed") {
      state.block_reason = "Sanity check failed — impossible stat values detected";
    } else if (state.grain_validation_status === "failed") {
      state.block_reason = "Grain mismatch — team-level data used in player-level compute";
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
