/**
 * Hook for live prop readiness pipeline.
 * Prefers server-side precomputed readiness from live_prop_readiness table.
 * Falls back to client-side computation only when server data is absent.
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
  source: "server" | "client_fallback";
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
  source: "client_fallback",
};

export function useLiveReadiness(gameId: string | undefined) {
  return useQuery({
    queryKey: ["live-readiness", gameId],
    queryFn: async (): Promise<LiveReadinessFlags> => {
      if (!gameId) return EMPTY;

      // ── Try server-side precomputed readiness first ──
      const { data: precomputed } = await supabase
        .from("live_prop_readiness" as any)
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();

      if (precomputed) {
        const p = precomputed as any;
        return {
          game_status_synced: p.game_status_synced ?? false,
          provider_game_mapped: p.provider_game_mapped ?? false,
          roster_ready: p.roster_ready ?? false,
          lineups_ready: p.lineups_ready ?? false,
          live_boxscore_ready: p.live_boxscore_ready ?? false,
          player_live_stats_ready: p.player_live_stats_ready ?? false,
          odds_ready: p.odds_ready ?? false,
          market_definitions_ready: p.market_definitions_ready ?? false,
          active_model_ready: p.active_model_ready ?? false,
          scorecard_ready: p.scorecard_ready ?? false,
          live_prop_rows_generated: p.live_prop_rows_generated ?? false,
          failure_stage: p.failure_stage ?? null,
          failure_detail: p.failure_detail ?? null,
          checked_at: p.checked_at ?? null,
          source: "server",
        };
      }

      // ── Fallback: compute readiness client-side ──
      const [gameRes, rosterRes, oddsRes, propsRes, modelRes] = await Promise.all([
        supabase.from("games").select("id, status, external_id, home_abbr, away_abbr, league").eq("id", gameId).maybeSingle(),
        supabase.from("player_game_stats" as any).select("id").eq("game_id", gameId).eq("period", "full").limit(1),
        supabase.from("odds_snapshots").select("id").eq("game_id", gameId).limit(1),
        supabase.from("nba_player_props_live" as any).select("id").eq("game_id", gameId).limit(1),
        supabase.from("model_activation_state" as any).select("runtime_status").eq("scope_type", "global").eq("scope_key", "default").maybeSingle(),
      ]);

      const game = gameRes.data;

      // Lineup check (separate query since we need game teams)
      let lineupsReady = false;
      if (game?.home_abbr && game?.away_abbr) {
        const { data: lineups } = await supabase
          .from("depth_charts")
          .select("id")
          .in("team_abbr", [game.home_abbr, game.away_abbr])
          .limit(5);
        lineupsReady = (lineups?.length ?? 0) >= 5;
      }

      const flags: LiveReadinessFlags = {
        game_status_synced: !!game?.status,
        provider_game_mapped: !!game?.external_id,
        roster_ready: (rosterRes.data?.length ?? 0) > 0,
        lineups_ready: lineupsReady,
        live_boxscore_ready: (rosterRes.data?.length ?? 0) > 0,
        player_live_stats_ready: (rosterRes.data?.length ?? 0) > 0,
        odds_ready: (oddsRes.data?.length ?? 0) > 0,
        market_definitions_ready: true,
        active_model_ready: (modelRes.data as any)?.runtime_status === "confirmed",
        scorecard_ready: true,
        live_prop_rows_generated: (propsRes.data?.length ?? 0) > 0,
        failure_stage: null,
        failure_detail: null,
        checked_at: new Date().toISOString(),
        source: "client_fallback",
      };

      // Determine first failed stage
      const stages: [string, boolean, string][] = [
        ["game_status_synced", flags.game_status_synced, "Game status not synced"],
        ["provider_game_mapped", flags.provider_game_mapped, "No external provider ID"],
        ["roster_ready", flags.roster_ready, "Insufficient roster data"],
        ["lineups_ready", flags.lineups_ready, "Depth chart data missing or incomplete"],
        ["odds_ready", flags.odds_ready, "No odds snapshots found"],
        ["active_model_ready", flags.active_model_ready, "No runtime-confirmed model"],
        ["live_prop_rows_generated", flags.live_prop_rows_generated, "No live prop rows generated"],
      ];

      for (const [name, ok, detail] of stages) {
        if (!ok) {
          flags.failure_stage = name;
          flags.failure_detail = `${detail} for ${game?.home_abbr ?? "?"} vs ${game?.away_abbr ?? "?"}`;
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
