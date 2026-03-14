import { Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  aiVersions: string | null;
  loading: boolean;
  onCompare: () => void;
}

export function SlipVersionCompare({ aiVersions, loading, onCompare }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Version Comparison
      </p>

      {!aiVersions && !loading && (
        <button
          onClick={onCompare}
          className="w-full p-3 rounded-lg border border-dashed border-cosmic-cyan/30 hover:bg-cosmic-cyan/5 transition-colors text-center"
        >
          <Zap className="h-4 w-4 text-cosmic-cyan mx-auto mb-1" />
          <p className="text-[10px] font-semibold text-cosmic-cyan">Compare Versions</p>
          <p className="text-[8px] text-muted-foreground">Generate Safer, Balanced, and High-Ceiling versions</p>
        </button>
      )}

      {loading && (
        <div className="p-3 rounded-lg border border-cosmic-cyan/20 bg-cosmic-cyan/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-cosmic-cyan" />
          <p className="text-[10px] text-cosmic-cyan">Building version comparisons…</p>
        </div>
      )}

      {aiVersions && (
        <div className="p-3 rounded-xl bg-cosmic-cyan/5 border border-cosmic-cyan/20 space-y-1.5">
          <div className="text-[10px] text-foreground leading-relaxed whitespace-pre-wrap">
            {aiVersions.split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1
                ? <strong key={i} className="text-cosmic-cyan">{part}</strong>
                : <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
