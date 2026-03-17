import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { scoreSlip, type LegInput, type SlipScore } from "@/lib/slip-optimizer-engine";
import { toast } from "@/hooks/use-toast";
import { useBettingProfile } from "@/hooks/use-betting-profile";

interface UseSlipOptimizerOptions {
  slip: any;
  picks: any[];
  intentState: string;
}

export function useSlipOptimizer({ slip, picks, intentState }: UseSlipOptimizerOptions) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const { profile: bettingProfile } = useBettingProfile();

  // Fetch live_prop_state for all picks to enrich scoring
  const gameIds = [...new Set((picks || []).map((p: any) => p.game_id).filter(Boolean) as string[])];
  const playerIds = [...new Set((picks || []).map((p: any) => p.player_id).filter(Boolean) as string[])];

  const { data: liveStates } = useQuery({
    queryKey: ["slip-live-prop-state", gameIds.sort().join(","), playerIds.sort().join(",")],
    queryFn: async () => {
      if (!gameIds.length || !playerIds.length) return {};
      const { data } = await supabase
        .from("live_prop_state")
        .select("*")
        .in("game_id", gameIds)
        .in("player_id", playerIds);
      const map: Record<string, any> = {};
      for (const s of (data || [])) {
        // Key by game_id:player_id:prop_type (loose match)
        const key = `${s.game_id}:${s.player_id}:${s.prop_type}`;
        map[key] = s;
      }
      return map;
    },
    enabled: gameIds.length > 0 && playerIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Deterministic scoring with live intelligence
  const slipScore: SlipScore = useMemo(() => {
    const legInputs: LegInput[] = (picks || []).map((p: any) => {
      // Try to find live_prop_state match
      const statType = (p.stat_type || "").toLowerCase();
      const colonIdx = statType.indexOf(":");
      const cleanStat = colonIdx > 0 ? statType.slice(colonIdx + 1) : statType;
      const liveKey = `${p.game_id}:${p.player_id}:${cleanStat}`;
      const ls = liveStates?.[liveKey] || null;

      return {
        id: p.id,
        player_name_raw: p.player_name_raw,
        stat_type: p.stat_type,
        line: Number(p.line),
        direction: p.direction,
        match_status: p.match_status || "unresolved",
        live_value: p.live_value,
        progress: p.progress,
        result: p.result,
        game_id: p.game_id || null,
        player_id: p.player_id || null,
        // Enrich from live_prop_state
        projection: ls?.projected_final ?? null,
        hit_probability: ls?.hit_probability ?? null,
        implied_probability: ls?.implied_probability ?? null,
        live_edge: ls?.live_edge ?? null,
        expected_return: ls?.expected_return ?? null,
        confidence: ls?.live_confidence ?? null,
        volatility: ls?.volatility ?? null,
        minutes_security_score: ls?.minutes_security_score ?? null,
        foul_risk_level: ls?.foul_risk_level ?? null,
        blowout_probability: ls?.blowout_probability ?? null,
        projected_minutes: ls?.projected_minutes ?? null,
        pace_pct: ls?.pace_pct ?? null,
        status_label: ls?.status_label ?? null,
        astro_note: ls?.astro_note ?? null,
      };
    });
    return scoreSlip(
      { entry_type: slip?.entry_type, stake: slip?.stake, payout: slip?.payout },
      legInputs
    );
  }, [slip, picks, liveStates]);

  const runAiAction = useCallback(async (action: string) => {
    setAiLoading(true);
    setLastAction(action);
    setAiAnalysis(null);
    try {
      const res = await supabase.functions.invoke("slip-optimizer", {
        body: {
          action,
          slip,
          picks,
          intent_state: intentState,
          slip_score: slipScore,
          user_profile: bettingProfile ? {
            archetype: bettingProfile.betting_archetype,
            risk_tolerance: bettingProfile.risk_tolerance,
            best_markets: bettingProfile.best_performing_markets,
            worst_markets: bettingProfile.worst_performing_markets,
            strongest_stats: bettingProfile.strongest_stat_types,
          } : null,
        },
      });
      });

      if (res.error) throw new Error(res.error.message || "AI analysis failed");
      if (!res.data?.ok) throw new Error(res.data?.error || "AI analysis failed");

      setAiAnalysis(res.data.analysis);
    } catch (e: any) {
      const msg = e.message || "Failed to run optimizer";
      if (msg.includes("Rate limited") || msg.includes("429")) {
        toast({ title: "Rate limited", description: "Please try again in a moment.", variant: "destructive" });
      } else if (msg.includes("credits") || msg.includes("402")) {
        toast({ title: "Credits exhausted", description: "Add credits in Settings → Workspace.", variant: "destructive" });
      } else {
        toast({ title: "Optimizer error", description: msg, variant: "destructive" });
      }
    } finally {
      setAiLoading(false);
    }
  }, [slip, picks, intentState, slipScore]);

  return { slipScore, aiAnalysis, aiLoading, lastAction, runAiAction };
}
