import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ── Player Momentum States ── */
export type PlayerMomentumState =
  | "explosive" | "hot" | "heating_up" | "neutral"
  | "cooling" | "stalled" | "disengaged";

export type PlayerSurgeState =
  | "usage_spike" | "playmaking_surge" | "rebound_surge"
  | "second_half_surge" | "closing_surge" | "facilitator_mode"
  | "scorer_mode" | "low_involvement" | "decoy_mode" | "neutral";

export interface PlayerMomentum {
  playerId: string;
  playerName: string;
  momentumState: PlayerMomentumState;
  surgeState: PlayerSurgeState;
  coolingRisk: number;        // 0-100
  deadZoneRisk: number;       // 0-100
  closerActivationScore: number; // 0-100
  roleShiftState: string | null;
  pointsSupportScore: number;  // 0-100
  reboundsSupportScore: number;
  assistsSupportScore: number;
  environmentMultiplier: number; // 0.7-1.3
  momentumNote: string;
  minutesPlayed: number;
  currentPts: number;
  currentReb: number;
  currentAst: number;
  recentFGA: number;
  foulCount: number;
}

/** Derive momentum from live player_game_stats + game context */
function derivePlayerMomentum(
  stats: any,
  seasonAvg: any,
  gameStatus: string,
  gamePeriod: number,
): PlayerMomentum {
  const min = Number(stats?.minutes ?? 0);
  const pts = Number(stats?.points ?? 0);
  const reb = Number(stats?.rebounds ?? 0);
  const ast = Number(stats?.assists ?? 0);
  const fga = Number(stats?.fg_attempted ?? 0);
  const fouls = Number(stats?.personal_fouls ?? stats?.fouls ?? 0);

  const avgPts = Number(seasonAvg?.points ?? 15);
  const avgReb = Number(seasonAvg?.rebounds ?? 5);
  const avgAst = Number(seasonAvg?.assists ?? 3);
  const avgMin = Number(seasonAvg?.minutes ?? 30);
  const avgFGA = Number(seasonAvg?.fg_attempted ?? 12);

  // Rate calculations (per-minute pace)
  const minPlayed = Math.max(min, 1);
  const ptsRate = pts / minPlayed;
  const rebRate = reb / minPlayed;
  const astRate = ast / minPlayed;
  const expectedPtsRate = avgMin > 0 ? avgPts / avgMin : 0.5;
  const expectedRebRate = avgMin > 0 ? avgReb / avgMin : 0.15;
  const expectedAstRate = avgMin > 0 ? avgAst / avgMin : 0.1;

  // Momentum ratios
  const ptsRatio = expectedPtsRate > 0 ? ptsRate / expectedPtsRate : 1;
  const rebRatio = expectedRebRate > 0 ? rebRate / expectedRebRate : 1;
  const astRatio = expectedAstRate > 0 ? astRate / expectedAstRate : 1;
  const overallRatio = (ptsRatio * 0.5 + rebRatio * 0.25 + astRatio * 0.25);

  // Support scores (0-100)
  const ptsSupportScore = Math.min(100, Math.round(ptsRatio * 50));
  const rebSupportScore = Math.min(100, Math.round(rebRatio * 50));
  const astSupportScore = Math.min(100, Math.round(astRatio * 50));

  // Momentum state
  let momentumState: PlayerMomentumState = "neutral";
  if (overallRatio >= 1.8) momentumState = "explosive";
  else if (overallRatio >= 1.4) momentumState = "hot";
  else if (overallRatio >= 1.15) momentumState = "heating_up";
  else if (overallRatio >= 0.7) momentumState = "neutral";
  else if (overallRatio >= 0.4) momentumState = "cooling";
  else if (min > 10) momentumState = "stalled";
  else if (min < 5 && gamePeriod >= 2) momentumState = "disengaged";

  // Surge state
  let surgeState: PlayerSurgeState = "neutral";
  const fgaRate = fga / minPlayed;
  const expectedFGARate = avgMin > 0 ? avgFGA / avgMin : 0.4;
  if (fgaRate > expectedFGARate * 1.5 && ptsRatio > 1.2) surgeState = "scorer_mode";
  else if (fgaRate > expectedFGARate * 1.3) surgeState = "usage_spike";
  else if (astRatio > 1.6) surgeState = "facilitator_mode";
  else if (astRatio > 1.3) surgeState = "playmaking_surge";
  else if (rebRatio > 1.5) surgeState = "rebound_surge";
  else if (fgaRate < expectedFGARate * 0.5 && min > 8) surgeState = "low_involvement";
  else if (fgaRate < expectedFGARate * 0.3 && min > 10) surgeState = "decoy_mode";

  // Closing activation (Q4+ performance likelihood)
  const closerScore = gamePeriod >= 4
    ? Math.min(100, Math.round((ptsRatio * 40) + (fgaRate / Math.max(expectedFGARate, 0.1)) * 30 + (fouls < 4 ? 30 : 10)))
    : Math.min(100, Math.round(overallRatio * 35 + (fouls < 3 ? 25 : 5)));

  // Dead zone risk: high fouls + late game + low involvement
  const deadZoneRisk = Math.min(100, Math.round(
    (fouls >= 5 ? 60 : fouls >= 4 ? 35 : fouls >= 3 ? 15 : 0) +
    (surgeState === "low_involvement" || surgeState === "decoy_mode" ? 25 : 0) +
    (overallRatio < 0.5 ? 15 : 0)
  ));

  // Cooling risk
  const coolingRisk = Math.min(100, Math.round(
    (momentumState === "cooling" || momentumState === "stalled" ? 40 : 0) +
    (fouls >= 4 ? 25 : fouls >= 3 ? 10 : 0) +
    (deadZoneRisk > 50 ? 20 : 0) +
    (overallRatio < 0.8 ? 10 : 0)
  ));

  // Environment multiplier
  let envMult = 1.0;
  if (momentumState === "explosive") envMult = 1.2;
  else if (momentumState === "hot") envMult = 1.12;
  else if (momentumState === "heating_up") envMult = 1.05;
  else if (momentumState === "cooling") envMult = 0.9;
  else if (momentumState === "stalled") envMult = 0.82;
  else if (momentumState === "disengaged") envMult = 0.75;

  // Role shift detection
  let roleShiftState: string | null = null;
  if (surgeState === "scorer_mode" && avgFGA > 0 && fgaRate > expectedFGARate * 1.4) roleShiftState = "Elevated Scorer";
  else if (surgeState === "facilitator_mode") roleShiftState = "Facilitator Mode";

  // Note
  const notes: string[] = [];
  if (momentumState === "explosive") notes.push("On fire — dominating");
  else if (momentumState === "hot") notes.push("Hot hand active");
  else if (momentumState === "cooling") notes.push("Production declining");
  else if (momentumState === "stalled") notes.push("Low output stretch");
  if (fouls >= 4) notes.push(`Foul trouble (${fouls})`);
  if (surgeState !== "neutral") {
    const surgeLabels: Record<string, string> = {
      usage_spike: "Usage spike", playmaking_surge: "Playmaking surge",
      rebound_surge: "Board surge", scorer_mode: "Scorer mode",
      facilitator_mode: "Facilitator mode", low_involvement: "Low involvement",
      decoy_mode: "Decoy/off-ball", closing_surge: "Closing surge",
    };
    notes.push(surgeLabels[surgeState] || surgeState);
  }

  return {
    playerId: stats?.player_id || "",
    playerName: stats?.player_name || "",
    momentumState,
    surgeState,
    coolingRisk,
    deadZoneRisk,
    closerActivationScore: closerScore,
    roleShiftState,
    pointsSupportScore: ptsSupportScore,
    reboundsSupportScore: rebSupportScore,
    assistsSupportScore: astSupportScore,
    environmentMultiplier: envMult,
    momentumNote: notes.join(" · ") || "Standard involvement",
    minutesPlayed: min,
    currentPts: pts,
    currentReb: reb,
    currentAst: ast,
    recentFGA: fga,
    foulCount: fouls,
  };
}

/**
 * Hook: derive player momentum from live game stats + season averages.
 */
export function usePlayerMomentum(
  playerId: string | null,
  gameId: string | null,
  gameStatus: string = "scheduled",
  gamePeriod: number = 1,
): PlayerMomentum | null {
  const isLive = gameStatus === "live" || gameStatus === "in_progress";

  const { data } = useQuery({
    queryKey: ["player-momentum", playerId, gameId, gamePeriod],
    queryFn: async (): Promise<PlayerMomentum | null> => {
      if (!playerId || !gameId) return null;

      // Get current game stats
      const { data: liveStats } = await supabase
        .from("player_game_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("game_id", gameId)
        .eq("period", "full")
        .maybeSingle();

      // Get season averages
      const { data: seasonStats } = await supabase
        .from("player_season_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("stat_type", "per_game")
        .eq("period", "full")
        .order("season", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!liveStats && !isLive) return null;

      return derivePlayerMomentum(liveStats, seasonStats, gameStatus, gamePeriod);
    },
    enabled: !!playerId && !!gameId && isLive,
    staleTime: 10_000,
    refetchInterval: isLive ? 15_000 : false,
  });

  return data ?? null;
}

/** Momentum state display helpers */
export const PLAYER_MOMENTUM_META: Record<PlayerMomentumState, { label: string; emoji: string; color: string }> = {
  explosive: { label: "Explosive", emoji: "🔥", color: "text-cosmic-red" },
  hot: { label: "Hot", emoji: "🌡️", color: "text-orange-400" },
  heating_up: { label: "Heating Up", emoji: "⚡", color: "text-cosmic-gold" },
  neutral: { label: "Neutral", emoji: "⚖️", color: "text-muted-foreground" },
  cooling: { label: "Cooling", emoji: "❄️", color: "text-blue-400" },
  stalled: { label: "Stalled", emoji: "🐌", color: "text-muted-foreground" },
  disengaged: { label: "Disengaged", emoji: "💤", color: "text-muted-foreground/60" },
};

export const SURGE_META: Record<PlayerSurgeState, { label: string; emoji: string }> = {
  usage_spike: { label: "Usage Spike", emoji: "📈" },
  playmaking_surge: { label: "Playmaking Surge", emoji: "🎯" },
  rebound_surge: { label: "Board Surge", emoji: "💪" },
  second_half_surge: { label: "2H Surge", emoji: "⚡" },
  closing_surge: { label: "Closer Active", emoji: "🎯" },
  facilitator_mode: { label: "Facilitator", emoji: "🏹" },
  scorer_mode: { label: "Scorer Mode", emoji: "🔥" },
  low_involvement: { label: "Low Involvement", emoji: "📉" },
  decoy_mode: { label: "Decoy", emoji: "👻" },
  neutral: { label: "", emoji: "" },
};
