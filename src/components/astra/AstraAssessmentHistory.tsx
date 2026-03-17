import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import AstraVerdictCard, { type AstraVerdict } from "./AstraVerdictCard";
import { Clock, Loader2 } from "lucide-react";

export default function AstraAssessmentHistory({ gameId, limit = 5 }: { gameId?: string; limit?: number }) {
  const { user } = useAuth();

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["astra-assessments", user?.id, gameId, limit],
    queryFn: async () => {
      let q = supabase
        .from("astra_bet_assessment")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (gameId) q = q.eq("game_id", gameId);
      const { data } = await q;
      return (data || []) as AstraVerdict[];
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!assessments?.length) {
    return (
      <div className="text-center py-6">
        <Clock className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No assessments yet. Ask Astra a betting question.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent Verdicts</h3>
      {assessments.map((a) => (
        <div key={a.id} className="space-y-1">
          {a.query_text && (
            <p className="text-[10px] text-muted-foreground italic truncate">"{a.query_text}"</p>
          )}
          <AstraVerdictCard verdict={a} compact />
        </div>
      ))}
    </div>
  );
}
