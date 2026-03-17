import { cn } from "@/lib/utils";
import { Flame, Snowflake, Zap, Target, Eye, TrendingUp, Shield, Sparkles } from "lucide-react";

const ARCHETYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  // Player archetypes
  closer: { icon: Target, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  surge_catalyst: { icon: TrendingUp, color: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30" },
  volatility_magnet: { icon: Zap, color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
  steady_hand: { icon: Shield, color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  cold_streak: { icon: Snowflake, color: "text-slate-400 bg-slate-500/15 border-slate-500/30" },
  // Game archetypes
  firestorm: { icon: Flame, color: "text-red-400 bg-red-500/15 border-red-500/30" },
  grindhouse: { icon: Shield, color: "text-stone-400 bg-stone-500/15 border-stone-500/30" },
  blowout_mirage: { icon: Eye, color: "text-orange-400 bg-orange-500/15 border-orange-500/30" },
  // Bet archetypes
  sharp_value: { icon: Target, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  hidden_gem: { icon: Sparkles, color: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
  trap_door: { icon: Eye, color: "text-red-400 bg-red-500/15 border-red-500/30" },
  fragile_edge: { icon: Zap, color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
};

interface ArchetypeBadgeProps {
  archetype: string;
  score?: number | null;
  size?: "sm" | "md";
  showScore?: boolean;
}

export default function ArchetypeBadge({ archetype, score, size = "sm", showScore = false }: ArchetypeBadgeProps) {
  const cfg = ARCHETYPE_CONFIG[archetype] || { icon: Sparkles, color: "text-muted-foreground bg-muted/50 border-border/50" };
  const Icon = cfg.icon;
  const label = archetype.replace(/_/g, " ");

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-semibold capitalize transition-all",
      cfg.color,
      size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[11px]"
    )}>
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      {label}
      {showScore && score != null && (
        <span className="font-mono opacity-70 ml-0.5">{(score * 100).toFixed(0)}</span>
      )}
    </span>
  );
}
