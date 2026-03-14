import { RefreshCw, Loader2 } from "lucide-react";

interface Props {
  analysis: string | null;
  loading: boolean;
  onRequest: () => void;
}

export function SlipRebuildSuggestions({ analysis, loading, onRequest }: Props) {
  return (
    <div className="space-y-2">
      {!analysis && !loading && (
        <button
          onClick={onRequest}
          className="w-full p-2.5 rounded-xl bg-cosmic-cyan/5 border border-cosmic-cyan/20 text-left hover:bg-cosmic-cyan/10 transition-colors"
        >
          <p className="text-[10px] font-semibold text-cosmic-cyan flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> What I'd Change Next Time
          </p>
          <p className="text-[8px] text-muted-foreground mt-0.5">
            Advisory rebuild suggestions for future slips
          </p>
        </button>
      )}

      {loading && (
        <div className="p-3 rounded-xl border border-cosmic-cyan/20 bg-cosmic-cyan/5 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-cosmic-cyan" />
          <p className="text-[10px] text-cosmic-cyan">Generating rebuild suggestions…</p>
        </div>
      )}

      {analysis && (
        <div className="p-3 rounded-xl bg-cosmic-cyan/5 border border-cosmic-cyan/20 space-y-1.5">
          <p className="text-[10px] font-semibold text-cosmic-cyan flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> What I'd Change Next Time
          </p>
          <div className="text-[10px] text-foreground leading-relaxed whitespace-pre-wrap">
            {analysis.split(/\*\*(.*?)\*\*/g).map((part, i) =>
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
