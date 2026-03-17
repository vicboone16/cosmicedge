/**
 * Hook for live prop readiness pipeline.
 * Computes 11-stage readiness flags for a game client-side
 * when server-side readiness data is missing.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LiveReadinessFlags {
  game_status_synced: boolean;
  provider_game_mapped: boolean;
  roster_ready: boolean;
  lineups_ready: boolean;
  live_boxscore_ready: boolean;
  player_live_stats_ready: boolean;
  odds_ready: boolean;
  market_definitions_ready: boolean;
  active_model_ready: boolean;
  scorecard_ready: boolean;
  live_prop_rows_generated: boolean;
  failure_stage: string | null;
  failure_detail: string | null;
  checked_at: string | null;
}

const EMPTY: LiveReadinessFlags = {
  game_status_synced: false,
  provider_game_mapped: false,
  roster_ready: false,
  lineups_ready: false,
  live_boxscore_ready: false,
  player_live_stats_ready: false,
  odds_ready: false,
  market_definitions_ready: false,
  active_model_ready: false,
  scorecard_ready: false,
  live_prop_rows_generated: false,
  failure_stage: null,
  failure_detail: null,
  checked_at: null,
};

export function useLiveReadiness(gameId: string | undefined) {
  return useQuery({
    queryKey: ["live-readiness", gameId],
    queryFn: async (): Promise<LiveReadinessFlags> => {
      if (!gameId) return EMPTY;

      // Try server-side precomputed readiness first
      const { data: precomputed } = await supabase
        .from("live_prop_readiness" as any)
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();

      if (precomputed) return precomputed as unknown as LiveReadinessFlags;

      // Fallback: compute readiness client-side from available data
      const [gameRes, rosterRes, oddsRes, propsRes, scorecardRes, modelRes] = await Promise.all([
        supabase.from("games").select("id, status, external_id, home_abbr, away_abbr").eq("id", gameId).maybeSingle(),
        supabase.from("player_game_stats" as any).select("id").eq("game_id", gameId).eq("period", "full").limit(1),
        supabase.from("odds_snapshots").select("id").eq("game_id", gameId).limit(1),
        supabase.from("nba_player_props_live" as any).select("id").eq("game_id", gameId).limit(1),
        supabase.from("ce_scorecards_fast_v9" as any).select("id").limit(1),
        supabase.from("model_activation_state" as any).select("runtime_status").eq("scope_type", "global").eq("scope_key", "default").maybeSingle(),
      ]);

      const game = gameRes.data;
      const flags: LiveReadinessFlags = {
        game_status_synced: !!game?.status,
        provider_game_mapped: !!game?.external_id,
        roster_ready: (rosterRes.data?.length ?? 0) > 0,
        lineups_ready: false, // would need depth_charts check
        live_boxscore_ready: (rosterRes.data?.length ?? 0) > 0,
        player_live_stats_ready: (rosterRes.data?.length ?? 0) > 0,
        odds_ready: (oddsRes.data?.length ?? 0) > 0,
        market_definitions_ready: true, // market catalog is static
        active_model_ready: (modelRes.data as any)?.runtime_status === "confirmed",
        scorecard_ready: (scorecardRes.data?.length ?? 0) > 0,
        live_prop_rows_generated: (propsRes.data?.length ?? 0) > 0,
        failure_stage: null,
        failure_detail: null,
        checked_at: new Date().toISOString(),
      };

      // Determine first failed stage
      const stages: [string, boolean][] = [
        ["game_status_synced", flags.game_status_synced],
        ["provider_game_mapped", flags.provider_game_mapped],
        ["roster_ready", flags.roster_ready],
        ["lineups_ready", flags.lineups_ready],
        ["odds_ready", flags.odds_ready],
        ["active_model_ready", flags.active_model_ready],
        ["scorecard_ready", flags.scorecard_ready],
        ["live_prop_rows_generated", flags.live_prop_rows_generated],
      ];

      for (const [name, ok] of stages) {
        if (!ok) {
          flags.failure_stage = name;
          flags.failure_detail = `Stage "${name}" not ready for game ${game?.home_abbr ?? "?"} vs ${game?.away_abbr ?? "?"}`;
          break;
        }
      }

      return flags;
    },
    enabled: !!gameId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
