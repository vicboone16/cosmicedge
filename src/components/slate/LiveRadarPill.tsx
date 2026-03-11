import { useState } from "react";
import { X, Zap } from "lucide-react";
import { useTopPropsToday, getPropLabel } from "@/hooks/use-top-props";
import { usePropDrawer } from "@/hooks/use-prop-drawer";

export function LiveRadarPill() {
  const [dismissed, setDismissed] = useState(false);
  const { data: props } = useTopPropsToday(1);
  const { openProp } = usePropDrawer();

  if (dismissed || !props || props.length === 0) return null;
  const top = props[0];
  const edgeScore = top.edge_score_v11 ?? top.edge_score;
  const diff = top.mu - (top.line ?? 0);
  const sign = diff >= 0 ? "+" : "";

  return (
    <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
      <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-foreground">
          Live Edge: {top.player_name?.split(" ").pop()} {getPropLabel(top.prop_type)} {sign}{diff.toFixed(1)}
        </span>
        <span className="text-[9px] text-muted-foreground ml-1.5">ES {edgeScore.toFixed(0)}</span>
      </div>
      <button
        onClick={() => openProp(top)}
        className="text-[9px] text-primary font-semibold hover:underline shrink-0"
      >
        View
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
