/**
 * #15 — Cosmic Confidence Tag
 * Small badge component that shows cosmic confidence level for a bet.
 * Uses ce_game_predictions edge + team_astro alignment to compute tier.
 */
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  gameId: string | null;
  /** Pre-computed edge tier from the bet itself (if available) */
  edgeTier?: string | null;
  className?: string;
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  S: { label: "S", color: "text-cosmic-gold", bg: "bg-cosmic-gold/15", emoji: "🔥" },
  A: { label: "A", color: "text-cosmic-green", bg: "bg-cosmic-green/15", emoji: "⚡" },
  B: { label: "B", color: "text-cosmic-cyan", bg: "bg-cosmic-cyan/15", emoji: "✦" },
  C: { label: "C", color: "text-muted-foreground", bg: "bg-secondary/40", emoji: "" },
};

function edgeToTier(edge: number): string {
  if (edge >= 8) return "S";
  if (edge >= 4) return "A";
  if (edge >= 1.5) return "B";
  return "C";
}

export function CosmicConfidenceTag({ gameId, edgeTier, className }: Props) {
  // If we already have an edge tier from the bet, use it directly
  const mappedTier = edgeTier === "elite" ? "S" : edgeTier === "high" ? "A" : edgeTier === "medium" ? "B" : edgeTier === "low" ? "C" : null;

  // Otherwise fetch from predictions
  const { data: prediction } = useQuery({
    queryKey: ["cosmic-conf-tag", gameId],
    queryFn: async () => {
      if (!gameId) return null;
      const { data } = await supabase
        .from("ce_game_predictions")
        .select("edge_home, edge_away, p_home_win, p_away_win")
        .eq("game_id", gameId)
        .order("run_ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !mappedTier && !!gameId,
    staleTime: 15 * 60 * 1000,
  });

  // Determine tier
  let tier: string;
  if (mappedTier) {
    tier = mappedTier;
  } else if (prediction) {
    const maxEdge = Math.max(Math.abs(prediction.edge_home || 0), Math.abs(prediction.edge_away || 0));
    tier = edgeToTier(maxEdge);
  } else {
    return null; // No data to show
  }

  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.C;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold",
      cfg.bg, cfg.color,
      className,
    )}>
      {cfg.emoji && <span>{cfg.emoji}</span>}
      <span>{cfg.label}-TIER</span>
    </span>
  );
}
