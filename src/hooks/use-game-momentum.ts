import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ── Momentum state labels ── */
export type MomentumLabel =
  | "Explosive" | "Heating Up" | "Surge" | "Closing Battle"
  | "Comeback Pressure" | "Volatile" | "Neutral"
  | "Slowing" | "Cooling" | "Dead Zone";

export type TempoLabel = "Blazing" | "Fast" | "Neutral" | "Slow" | "Crawl";
export type PressureLabel = "Bonus Danger" | "OREB Pressure" | "Drought Alert" | "Normal";

export interface GameMomentumState {
  gameId: string;
  /** -100 (away dominant) to +100 (home dominant) */
  momentumScore: number;
  /** Which side has momentum */
  momentumSide: "home" | "away" | "neutral";
  /** Descriptive label */
  momentumLabel: MomentumLabel;
  /** Recent scoring runs */
  recentRunHome: number;
  recentRunAway: number;
  /** Scoring droughts in seconds */
  droughtHomeSec: number;
  droughtAwaySec: number;
  /** Pace estimate */
  paceEstimate: number | null;
  tempoLabel: TempoLabel;
  /** Foul/bonus state */
  homeFoulsPeriod: number;
  awayFoulsPeriod: number;
  inBonusHome: boolean;
  inBonusAway: boolean;
  /** Empty possessions */
  emptyPossHome: number;
  emptyPossAway: number;
  /** OREB pressure */
  orebHomePeriod: number;
  orebAwayPeriod: number;
  orebPressureTeam: string | null;
  secondChancePressureTeam: string | null;
  /** Pressure indicators */
  pressureLabels: PressureLabel[];
  /** Raw data available */
  isLive: boolean;
}

function deriveMomentumLabel(score: number, runH: number, runA: number, droughtH: number, droughtA: number): MomentumLabel {
  const absScore = Math.abs(score);
  const maxRun = Math.max(runH, runA);
  const maxDrought = Math.max(droughtH, droughtA);

  if (absScore >= 70 && maxRun >= 12) return "Explosive";
  if (absScore >= 50) return "Heating Up";
  if (maxRun >= 10) return "Surge";
  if (absScore >= 30 && maxDrought >= 180) return "Comeback Pressure";
  if (absScore >= 25) return "Closing Battle";
  if (maxDrought >= 240) return "Dead Zone";
  if (maxDrought >= 120 && absScore < 15) return "Cooling";
  if (absScore < 10 && maxRun <= 4) return "Neutral";
  if (absScore < 20) return "Slowing";
  return "Volatile";
}

function deriveTempoLabel(pace: number | null): TempoLabel {
  if (pace == null) return "Neutral";
  if (pace >= 104) return "Blazing";
  if (pace >= 99) return "Fast";
  if (pace >= 92) return "Neutral";
  if (pace >= 85) return "Slow";
  return "Crawl";
}

/**
 * Hook: reads live game momentum from `live_game_visual_state` (primary)
 * and falls back to `v_game_momentum` view for final/scheduled games.
 */
export function useGameMomentum(gameId: string | null, isLive: boolean = false): GameMomentumState | null {
  const { data } = useQuery({
    queryKey: ["game-momentum", gameId, isLive],
    queryFn: async (): Promise<GameMomentumState | null> => {
      if (!gameId) return null;

      // Try live_game_visual_state first (richest source)
      const { data: liveState } = await supabase
        .from("live_game_visual_state")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();

      if (liveState) {
        const runH = liveState.recent_run_home ?? 0;
        const runA = liveState.recent_run_away ?? 0;
        const droughtH = liveState.recent_scoring_drought_home_sec ?? 0;
        const droughtA = liveState.recent_scoring_drought_away_sec ?? 0;
        const mScore = Number(liveState.momentum_score ?? 0);
        const pace = liveState.pace_estimate != null ? Number(liveState.pace_estimate) : null;

        const pressureLabels: PressureLabel[] = [];
        if (liveState.in_bonus_home || liveState.in_bonus_away) pressureLabels.push("Bonus Danger");
        if (liveState.oreb_pressure_team_id) pressureLabels.push("OREB Pressure");
        if (droughtH >= 120 || droughtA >= 120) pressureLabels.push("Drought Alert");
        if (pressureLabels.length === 0) pressureLabels.push("Normal");

        return {
          gameId,
          momentumScore: mScore,
          momentumSide: mScore > 10 ? "home" : mScore < -10 ? "away" : "neutral",
          momentumLabel: deriveMomentumLabel(mScore, runH, runA, droughtH, droughtA),
          recentRunHome: runH,
          recentRunAway: runA,
          droughtHomeSec: droughtH,
          droughtAwaySec: droughtA,
          paceEstimate: pace,
          tempoLabel: deriveTempoLabel(pace),
          homeFoulsPeriod: liveState.home_fouls_period ?? 0,
          awayFoulsPeriod: liveState.away_fouls_period ?? 0,
          inBonusHome: liveState.in_bonus_home ?? false,
          inBonusAway: liveState.in_bonus_away ?? false,
          emptyPossHome: liveState.empty_poss_home_last_n ?? 0,
          emptyPossAway: liveState.empty_poss_away_last_n ?? 0,
          orebHomePeriod: liveState.oreb_home_period ?? 0,
          orebAwayPeriod: liveState.oreb_away_period ?? 0,
          orebPressureTeam: liveState.oreb_pressure_team_id,
          secondChancePressureTeam: liveState.second_chance_pressure_team_id,
          pressureLabels,
          isLive: true,
        };
      }

      // Fallback: v_game_momentum view (works for any game with PBP data)
      const { data: viewData } = await supabase
        .from("v_game_momentum")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();

      if (viewData) {
        const runH = viewData.recent_run_home ?? 0;
        const runA = viewData.recent_run_away ?? 0;
        const mScore = Number(viewData.momentum_score ?? 0);

        // Also get droughts
        const { data: droughtData } = await supabase
          .from("v_game_scoring_droughts")
          .select("*")
          .eq("game_id", gameId)
          .maybeSingle();

        const droughtH = droughtData?.drought_home_sec ?? 0;
        const droughtA = droughtData?.drought_away_sec ?? 0;

        return {
          gameId,
          momentumScore: mScore,
          momentumSide: (viewData.momentum_side as "home" | "away") ?? "neutral",
          momentumLabel: deriveMomentumLabel(mScore, runH, runA, droughtH, droughtA),
          recentRunHome: runH,
          recentRunAway: runA,
          droughtHomeSec: droughtH,
          droughtAwaySec: droughtA,
          paceEstimate: null,
          tempoLabel: "Neutral",
          homeFoulsPeriod: 0,
          awayFoulsPeriod: 0,
          inBonusHome: false,
          inBonusAway: false,
          emptyPossHome: 0,
          emptyPossAway: 0,
          orebHomePeriod: 0,
          orebAwayPeriod: 0,
          orebPressureTeam: null,
          secondChancePressureTeam: null,
          pressureLabels: ["Normal"],
          isLive: false,
        };
      }

      return null;
    },
    enabled: !!gameId,
    staleTime: isLive ? 5_000 : 30_000,
    refetchInterval: isLive ? 10_000 : false,
  });

  return data ?? null;
}

/** Momentum label → color class mapping */
export function getMomentumColor(label: MomentumLabel): string {
  switch (label) {
    case "Explosive": return "text-cosmic-red";
    case "Heating Up": return "text-orange-400";
    case "Surge": return "text-cosmic-gold";
    case "Closing Battle": return "text-cosmic-cyan";
    case "Comeback Pressure": return "text-purple-400";
    case "Volatile": return "text-yellow-400";
    case "Cooling": return "text-blue-400";
    case "Dead Zone": return "text-muted-foreground";
    case "Slowing": return "text-muted-foreground/80";
    default: return "text-muted-foreground";
  }
}

/** Momentum label → icon suggestion */
export function getMomentumIcon(label: MomentumLabel): string {
  switch (label) {
    case "Explosive": return "🔥";
    case "Heating Up": return "🌡️";
    case "Surge": return "⚡";
    case "Closing Battle": return "⚔️";
    case "Comeback Pressure": return "🔄";
    case "Volatile": return "🌪️";
    case "Cooling": return "❄️";
    case "Dead Zone": return "💤";
    case "Slowing": return "🐌";
    default: return "⚖️";
  }
}
