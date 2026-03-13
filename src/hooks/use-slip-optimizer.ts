import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scoreSlip, type LegInput, type SlipScore } from "@/lib/slip-optimizer-engine";
import { toast } from "@/hooks/use-toast";

interface UseSlipOptimizerOptions {
  slip: any;
  picks: any[];
  intentState: string;
}

export function useSlipOptimizer({ slip, picks, intentState }: UseSlipOptimizerOptions) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Deterministic scoring
  const slipScore: SlipScore = useMemo(() => {
    const legInputs: LegInput[] = (picks || []).map((p: any) => ({
      id: p.id,
      player_name_raw: p.player_name_raw,
      stat_type: p.stat_type,
      line: Number(p.line),
      direction: p.direction,
      match_status: p.match_status || "unresolved",
      live_value: p.live_value,
      progress: p.progress,
      result: p.result,
    }));
    return scoreSlip(
      { entry_type: slip?.entry_type, stake: slip?.stake, payout: slip?.payout },
      legInputs
    );
  }, [slip, picks]);

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
        },
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
