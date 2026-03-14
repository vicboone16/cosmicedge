import { ArrowRight, TrendingUp, Shield, Zap, ArrowUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LegScore } from "@/lib/slip-optimizer-engine";

interface ReplacementSuggestion {
  current: { player: string; stat: string; line: number; direction: string; score: number; grade: string };
  replacement: { player: string; stat: string; line: number; direction: string; estimated_score: number; estimated_grade: string };
  deltas: {
    score: number;
    edge: number;
    confidence: number;
    volatility: number;
  };
  reason: string;
  tag: "safer" | "stronger_edge" | "lower_volatility" | "better_matchup" | "stronger_signal";
}

const TAG_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  safer: { label: "Safer", className: "text-cosmic-green border-cosmic-green/30", icon: Shield },
  stronger_edge: { label: "Stronger Edge", className: "text-cosmic-gold border-cosmic-gold/30", icon: Zap },
  lower_volatility: { label: "Lower Vol", className: "text-cosmic-cyan border-cosmic-cyan/30", icon: TrendingUp },
  better_matchup: { label: "Better Matchup", className: "text-primary border-primary/30", icon: ArrowUpDown },
  stronger_signal: { label: "Stronger Signal", className: "text-cosmic-gold border-cosmic-gold/30", icon: Zap },
};

function DeltaChip({ label, value, inverse }: { label: string; value: number; inverse?: boolean }) {
  const isGood = inverse ? value < 0 : value > 0;
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/40">
      <span className="text-[7px] text-muted-foreground">{label}</span>
      <span className={cn("text-[8px] font-bold tabular-nums",
        isGood ? "text-cosmic-green" : value === 0 ? "text-muted-foreground" : "text-cosmic-red"
      )}>
        {value > 0 ? "+" : ""}{value.toFixed(1)}
      </span>
    </div>
  );
}

interface Props {
  weakestLeg: LegScore | null;
  aiSuggestions: string | null;
  loading: boolean;
  onRequestSuggestions: () => void;
}

export function SlipReplacementDrawer({ weakestLeg, aiSuggestions, loading, onRequestSuggestions }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <ArrowUpDown className="h-3 w-3" /> Replacement Suggestions
      </p>

      {weakestLeg && (
        <div className="p-2 rounded-lg bg-cosmic-red/5 border border-cosmic-red/20">
          <p className="text-[9px] text-muted-foreground mb-1">Weakest Leg to Replace</p>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-cosmic-red/15 flex items-center justify-center text-[10px] font-black text-cosmic-red shrink-0">
              {weakestLeg.grade}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-foreground truncate">{weakestLeg.player_name_raw}</p>
              <p className="text-[8px] text-muted-foreground capitalize">{weakestLeg.stat_type} · {weakestLeg.direction} {weakestLeg.line} · Score {weakestLeg.score}</p>
            </div>
          </div>
        </div>
      )}

      {!aiSuggestions && !loading && (
        <button
          onClick={onRequestSuggestions}
          className="w-full p-2.5 rounded-lg border border-dashed border-primary/30 hover:bg-primary/5 transition-colors text-center"
        >
          <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-[10px] font-semibold text-primary">Find Replacements</p>
          <p className="text-[8px] text-muted-foreground">AI will search for better alternatives</p>
        </button>
      )}

      {loading && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-[10px] text-primary">Searching for replacement candidates…</p>
        </div>
      )}

      {aiSuggestions && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5">
          <div className="text-[10px] text-foreground leading-relaxed whitespace-pre-wrap">
            {aiSuggestions.split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1
                ? <strong key={i} className="text-primary">{part}</strong>
                : <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
