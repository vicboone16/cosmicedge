import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ArchetypeBadge from "./ArchetypeBadge";
import { Loader2, Sparkles } from "lucide-react";

interface ArchetypeCardProps {
  entityId: string;
  entityType: "player" | "game" | "bet" | "slip";
  compact?: boolean;
}

interface ArchetypeState {
  primary_archetype: string;
  secondary_archetype: string | null;
  archetype_score: number | null;
  archetype_confidence: number | null;
  math_archetype_relation: string | null;
  recommended_interpretation: string | null;
  momentum_signature: string | null;
  volatility_signature: string | null;
  pressure_signature: string | null;
}

const RELATION_LABELS: Record<string, { label: string; color: string }> = {
  math_confirms_archetype: { label: "Math Confirms", color: "text-emerald-400" },
  math_contradicts_archetype: { label: "Math Contradicts", color: "text-red-400" },
  math_neutral: { label: "Math Neutral", color: "text-muted-foreground" },
  archetype_enhances_math: { label: "Archetype Enhances", color: "text-cyan-400" },
};

export default function ArchetypeCard({ entityId, entityType, compact }: ArchetypeCardProps) {
  const { data: archetype, isLoading } = useQuery({
    queryKey: ["archetype-state", entityId, entityType],
    queryFn: async () => {
      const { data } = await supabase
        .from("cosmic_archetype_state")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as ArchetypeState | null;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }

  if (!archetype) return null;

  const relation = archetype.math_archetype_relation
    ? RELATION_LABELS[archetype.math_archetype_relation]
    : null;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <ArchetypeBadge archetype={archetype.primary_archetype} score={archetype.archetype_score} showScore />
        {archetype.secondary_archetype && (
          <ArchetypeBadge archetype={archetype.secondary_archetype} size="sm" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Cosmic Archetype</span>
        {archetype.archetype_confidence != null && (
          <span className="text-[9px] text-muted-foreground ml-auto tabular-nums">
            {(archetype.archetype_confidence * 100).toFixed(0)}% conf
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ArchetypeBadge archetype={archetype.primary_archetype} score={archetype.archetype_score} size="md" showScore />
        {archetype.secondary_archetype && (
          <ArchetypeBadge archetype={archetype.secondary_archetype} size="sm" />
        )}
      </div>

      {/* Math-Archetype Relation */}
      {relation && (
        <div className={cn("text-[10px] font-semibold", relation.color)}>
          ◆ {relation.label}
        </div>
      )}

      {/* Signatures */}
      {(archetype.momentum_signature || archetype.volatility_signature || archetype.pressure_signature) && (
        <div className="flex flex-wrap gap-2 text-[9px]">
          {archetype.momentum_signature && (
            <span className="px-2 py-0.5 rounded-full bg-muted/50 border border-border/30 text-muted-foreground">
              ⚡ {archetype.momentum_signature}
            </span>
          )}
          {archetype.volatility_signature && (
            <span className="px-2 py-0.5 rounded-full bg-muted/50 border border-border/30 text-muted-foreground">
              ⟁ {archetype.volatility_signature}
            </span>
          )}
          {archetype.pressure_signature && (
            <span className="px-2 py-0.5 rounded-full bg-muted/50 border border-border/30 text-muted-foreground">
              ◉ {archetype.pressure_signature}
            </span>
          )}
        </div>
      )}

      {/* Interpretation */}
      {archetype.recommended_interpretation && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic">
          {archetype.recommended_interpretation}
        </p>
      )}
    </div>
  );
}
