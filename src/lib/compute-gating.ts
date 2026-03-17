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

/** Check if narrative generation should be allowed */
export function shouldAllowNarrative(state: ComputeGateState): boolean {
  // Block if any critical step failed
  if (state.entity_resolution_status === "failed") return false;
  if (state.sanity_validation_status === "failed") return false;
  if (state.required_inputs_status === "failed") return false;
  // Allow partial variable retrieval (some data available)
  // Allow grain validation warnings
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
